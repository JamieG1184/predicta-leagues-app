import { NextResponse } from 'next/server'
import { supabaseServer } from '@/src/lib/supabase-server'
import { recalculateAllScores } from '@/src/lib/data'

export const dynamic = 'force-dynamic'

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football'
const PL_LEAGUE_ID = 8
const PL_SEASON_ID = 25583

// In-memory cache to coalesce concurrent client polls within a single
// serverless instance. Across instances Vercel won't share this — we accept
// the modest extra cost. At 30 users this is well within Sportmonks limits.
// Cache TTL chosen to align with the LivePoller's tightest (fast-mode)
// interval — beyond that we want fresh data so the live strip is responsive.
let lastSyncAt = 0
let cachedResponse: any = null
const CACHE_MS = 12_000

// State for the "settling sync" — when the route transitions from in-window
// to idle, we force one extra standings sync to catch the Sportmonks lag
// between match-finish and standings-updated. Without this, a match that
// finishes RIGHT as the lookback closes can leave our standings stale until
// someone manually re-syncs.
let lastInWindowAt: number | null = null
let settlingSyncDone = false
const SETTLING_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

// In-memory tracking of Sportmonks event IDs we've already dispatched as
// match-highlight notifications, keyed by fixture_id. Prevents duplicate
// "RED CARD!" / "PENALTY!" banners on subsequent polls of the same fixture.
// `initializedFixtures` lets us baseline (record without dispatching) the
// very first time we see a fixture, so the app doesn't spam every existing
// event in a match that started before we booted up.
const seenEventIds = new Map<number, Set<number>>()
const initializedFixtures = new Set<number>()

async function sportmonks(path: string) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${SPORTMONKS_BASE}${path}${sep}api_token=${process.env.SPORTMONKS_API_TOKEN}`
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Sportmonks ${res.status}: ${await res.text()}`)
  return res.json()
}

async function getCurrentSeasonId(): Promise<number> {
  const { data } = await supabaseServer
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .single()
  if (!data) throw new Error('No current season')
  return data.id
}

/**
 * Returns metadata about the current match-day window so the client can
 * tune its polling frequency without us hitting Sportmonks unnecessarily.
 */
async function getMatchWindow(seasonId: number) {
  const now = new Date()
  // Look back 6 hours. Buffer for stoppage / extra time / Sportmonks lag
  // between match-finish and standings-updated. (Previously 3h, but that was
  // tight — Sportmonks sometimes takes 5–10 min after FT to refresh
  // standings, and we want the window to stay "in-play" long enough for the
  // standings sync to catch the update.)
  const lookback = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
  // Look forward 30 minutes (catches fixtures about to kick off)
  const lookforward = new Date(now.getTime() + 30 * 60 * 1000).toISOString()

  // In-window: fixtures whose start is between lookback and lookforward,
  // and which are NOT already in state_id=5 (Full Time).
  const { data: inWindow } = await supabaseServer
    .from('fixtures')
    .select('id, starting_at, state_id')
    .eq('season_id', seasonId)
    .gte('starting_at', lookback)
    .lte('starting_at', lookforward)
    .neq('state_id', 5)
    .order('starting_at', { ascending: true })

  // Next-future fixture for "idle" reporting (so the UI can show
  // "Next match: Sat 14:00" or similar later).
  const { data: nextFuture } = await supabaseServer
    .from('fixtures')
    .select('starting_at')
    .eq('season_id', seasonId)
    .gt('starting_at', now.toISOString())
    .neq('state_id', 5)
    .order('starting_at', { ascending: true })
    .limit(1)

  return {
    in_window: (inWindow?.length ?? 0) > 0,
    in_window_count: inWindow?.length ?? 0,
    next_fixture_at: nextFuture?.[0]?.starting_at ?? null,
  }
}

async function syncStandings(seasonId: number, teamIdBySportmonks: Map<number, number>) {
  const resp = await sportmonks(`/standings/seasons/${PL_SEASON_ID}`)
  const rows = (resp.data ?? [])
    .map((r: any) => {
      const localTeamId = teamIdBySportmonks.get(r.participant_id)
      if (!localTeamId) return null
      return {
        season_id: seasonId,
        team_id: localTeamId,
        position: r.position,
        points: r.points ?? 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        goal_difference: 0,
        updated_at: new Date().toISOString(),
      }
    })
    .filter(Boolean)

  // Hash to detect change: pos + pts per team
  const hash = rows
    .map((r: any) => `${r.team_id}:${r.position}:${r.points}`)
    .sort()
    .join('|')

  // Compare to previous standings to detect changes
  const { data: existing } = await supabaseServer
    .from('actual_standings')
    .select('team_id, position, points')
    .eq('season_id', seasonId)
  const existingHash = (existing ?? [])
    .map((r: any) => `${r.team_id}:${r.position}:${r.points}`)
    .sort()
    .join('|')
  const standingsChanged = hash !== existingHash

  if (standingsChanged) {
    await supabaseServer
      .from('actual_standings')
      .upsert(rows, { onConflict: 'season_id,team_id' })
  }
  return { standingsChanged, rowsCount: rows.length }
}

export async function GET() {
  try {
    const now = Date.now()
    if (cachedResponse && now - lastSyncAt < CACHE_MS) {
      return NextResponse.json({ ...cachedResponse, cached: true })
    }

    const seasonId = await getCurrentSeasonId()
    const window = await getMatchWindow(seasonId)

    // Idle mode: no fixtures in the immediate window — skip the Sportmonks
    // calls. We still defensively clear any lingering live_period flags so
    // matches that finished off-window don't get stuck on the Live strip.
    if (!window.in_window) {
      const { data: lingering } = await supabaseServer
        .from('fixtures')
        .select('sportmonks_id')
        .not('live_period', 'is', null)
      let cleared = 0
      if (lingering && lingering.length > 0) {
        await supabaseServer
          .from('fixtures')
          .update({
            live_home_score: null,
            live_away_score: null,
            live_minute: null,
            live_period: null,
          })
          .in(
            'sportmonks_id',
            lingering.map((r: any) => r.sportmonks_id)
          )
        cleared = lingering.length
      }

      // Settling sync: if we were in-window recently (matches just finished),
      // do ONE extra standings sync to catch any post-FT lag from Sportmonks.
      // Skip if we've already done it this idle period.
      let settlingSynced = false
      let settlingChanged = false
      const recentlyInWindow =
        lastInWindowAt != null && Date.now() - lastInWindowAt < SETTLING_WINDOW_MS
      if (recentlyInWindow && !settlingSyncDone) {
        const { data: teams } = await supabaseServer
          .from('teams')
          .select('id, sportmonks_id')
        const teamIdBySportmonks = new Map(
          (teams ?? [])
            .filter((t: any) => t.sportmonks_id != null)
            .map((t: any): [number, number] => [t.sportmonks_id as number, t.id])
        )
        const settling = await syncStandings(seasonId, teamIdBySportmonks)
        settlingSynced = true
        settlingChanged = settling.standingsChanged
        if (settlingChanged) {
          await recalculateAllScores('settling_sync')
        }
        settlingSyncDone = true
      }

      cachedResponse = {
        live_fixtures: [],
        has_live_matches: false,
        has_updates: cleared > 0 || settlingChanged,
        idle: true,
        next_fixture_at: window.next_fixture_at,
        last_synced_at: new Date().toISOString(),
        settling_synced: settlingSynced,
        settling_changed: settlingChanged,
      }
      lastSyncAt = now
      return NextResponse.json({ ...cachedResponse, cached: false })
    }

    // We're in-window — record the timestamp and arm the settling-sync flag
    // for whenever we next transition back to idle.
    lastInWindowAt = Date.now()
    settlingSyncDone = false

    const { data: teams } = await supabaseServer
      .from('teams')
      .select('id, sportmonks_id')
    const teamIdBySportmonks = new Map(
      (teams ?? [])
        .filter((t: any) => t.sportmonks_id != null)
        .map((t: any): [number, number] => [t.sportmonks_id as number, t.id])
    )

    // 1. Fetch in-play live matches with scores + events includes. Events
    //    let us flash banners for penalties, red cards, etc. Gracefully
    //    degrade if either include is restricted on our Sportmonks plan.
    let inplay
    try {
      inplay = await sportmonks(`/livescores/inplay?include=scores;events`)
    } catch {
      try {
        inplay = await sportmonks(`/livescores/inplay?include=scores`)
      } catch {
        inplay = await sportmonks(`/livescores/inplay`)
      }
    }
    const plLive = (inplay.data ?? []).filter(
      (f: any) => f.league_id === PL_LEAGUE_ID && f.season_id === PL_SEASON_ID
    )

    function periodLabel(stateId: number): string | null {
      switch (stateId) {
        case 2:
          return '1H'
        case 3:
          return 'HT'
        case 4:
          return '2H'
        case 5:
          return 'FT'
        case 6:
          return 'ET 1H'
        case 7:
          return 'ET HT'
        case 8:
          return 'ET 2H'
        case 9:
          return 'PEN'
        case 22:
          return 'STOPPAGE'
        default:
          return null
      }
    }

    function extractScores(fixture: any): { home: number | null; away: number | null } {
      // Sportmonks v3 typically returns scores as an array of entries with
      // { participant: 'home'|'away', score: { goals }, description }
      const scores = fixture.scores
      if (!Array.isArray(scores)) return { home: null, away: null }
      const current = scores.filter(
        (s: any) =>
          (s.description ?? '').toLowerCase().includes('current') ||
          s.type_id === 1525
      )
      const list = current.length > 0 ? current : scores
      let home: number | null = null
      let away: number | null = null
      for (const s of list) {
        const g = s?.score?.goals ?? s?.goals
        if (g == null) continue
        const part = (s.participant ?? s.score?.participant ?? '').toLowerCase()
        if (part === 'home') home = g
        else if (part === 'away') away = g
      }
      return { home, away }
    }

    type SportmonksEvent = {
      id: number
      type_id?: number
      type?: { id?: number; name?: string; code?: string }
      code?: string
      minute?: number | null
      rescinded?: boolean | null
      player_name?: string | null
      participant_id?: number | null
    }

    type LiveFixture = {
      id: number
      name: string
      state_id: number
      period: string | null
      starting_at: string
      result_info: string | null
      home_score: number | null
      away_score: number | null
      events: SportmonksEvent[]
    }
    const liveFixtures: LiveFixture[] = plLive.map((f: any) => {
      const { home, away } = extractScores(f)
      return {
        id: f.id,
        name: f.name,
        state_id: f.state_id,
        period: periodLabel(f.state_id),
        starting_at: f.starting_at,
        result_info: f.result_info,
        home_score: home,
        away_score: away,
        events: Array.isArray(f.events) ? (f.events as SportmonksEvent[]) : [],
      }
    })

    // 1b. Update fixtures table with live data and detect changes
    let liveScoresChanged = false
    // Track FT transitions in this poll — only fixtures that JUST finished
    // should trigger a standings sync. This keeps the static standings
    // stable during in-play matches, even if Sportmonks reports interim
    // standings updates.
    let ftTransitionThisPoll = false
    // Unified match-highlight feed for this poll. Each entry is a "moment"
    // worth flashing in the UI (Live Now strip row + standings header pill).
    // Types we currently surface:
    //   goal              — live score increased (existing)
    //   goal_disallowed   — live score DECREASED (VAR overturn)
    //   penalty           — new PENALTY event from Sportmonks
    //   red_card          — new REDCARD or YELLOWREDCARD (2nd yellow) event
    type Highlight = {
      fixture_id: number
      type: 'goal' | 'goal_disallowed' | 'penalty' | 'red_card'
      description: string
      home_score?: number
      away_score?: number
      minute?: number | null
      player_name?: string | null
    }
    const highlights: Highlight[] = []

    if (liveFixtures.length > 0) {
      const ids = liveFixtures.map((f) => f.id)
      const { data: existing } = await supabaseServer
        .from('fixtures')
        .select('sportmonks_id, live_home_score, live_away_score, live_period, state_id')
        .in('sportmonks_id', ids)
      const existingById = new Map(
        (existing ?? []).map((r: any): [number, any] => [r.sportmonks_id, r])
      )

      for (const f of liveFixtures) {
        const prev = existingById.get(f.id)
        const changed =
          !prev ||
          prev.live_home_score !== f.home_score ||
          prev.live_away_score !== f.away_score ||
          prev.live_period !== f.period ||
          prev.state_id !== f.state_id
        if (changed) liveScoresChanged = true
        // FT transition: fixture is at state 5 now, but wasn't before.
        if (f.state_id === 5 && (prev?.state_id ?? null) !== 5) {
          ftTransitionThisPoll = true
        }
        // Score-derived highlights: GOAL (score went up) or GOAL DISALLOWED
        // via VAR (score went DOWN — only happens when a previously-counted
        // goal is overturned). Only fires when we have a previous record.
        if (prev) {
          const prevH = prev.live_home_score ?? 0
          const prevA = prev.live_away_score ?? 0
          const newH = f.home_score ?? 0
          const newA = f.away_score ?? 0
          if ((newH > prevH || newA > prevA) && f.name) {
            highlights.push({
              fixture_id: f.id,
              type: 'goal',
              description: `${f.name} · ${newH}–${newA}`,
              home_score: newH,
              away_score: newA,
            })
          } else if ((newH < prevH || newA < prevA) && f.name) {
            highlights.push({
              fixture_id: f.id,
              type: 'goal_disallowed',
              description: `${f.name} · now ${newH}–${newA}`,
              home_score: newH,
              away_score: newA,
            })
          }
        }

        // Event-derived highlights: penalty awarded, red card. Compare
        // current event IDs against the in-memory seen-set; new ones get
        // dispatched. First time we see a fixture we BASELINE (record
        // without firing) so older events from earlier in the match don't
        // re-fire when our serverless instance cold-starts.
        const seen = seenEventIds.get(f.id) ?? new Set<number>()
        const baseline = !initializedFixtures.has(f.id)
        for (const ev of f.events) {
          if (!ev || typeof ev.id !== 'number') continue
          if (seen.has(ev.id)) continue
          // Always record we've seen this event so we don't refire later.
          seen.add(ev.id)
          // Skip baselining and explicitly rescinded events.
          if (baseline) continue
          if (ev.rescinded === true) continue

          const codeRaw =
            (ev.type?.code ?? ev.code ?? ev.type?.name ?? '').toString().toUpperCase()
          const minute = ev.minute ?? null
          const player = ev.player_name ?? null
          // Detect penalty awarded. Sportmonks may emit either "PENALTY"
          // (awarded) or a "PEN" variant; we accept the common forms.
          if (codeRaw === 'PENALTY' || codeRaw === 'PEN_AWARDED') {
            highlights.push({
              fixture_id: f.id,
              type: 'penalty',
              description: player
                ? `Penalty · ${f.name} · ${player}`
                : `Penalty · ${f.name}`,
              minute,
              player_name: player,
            })
          } else if (codeRaw === 'REDCARD' || codeRaw === 'YELLOWREDCARD') {
            highlights.push({
              fixture_id: f.id,
              type: 'red_card',
              description: player
                ? `Red card · ${f.name} · ${player}`
                : `Red card · ${f.name}`,
              minute,
              player_name: player,
            })
          }
        }
        seenEventIds.set(f.id, seen)
        initializedFixtures.add(f.id)
        await supabaseServer
          .from('fixtures')
          .update({
            state_id: f.state_id,
            live_home_score: f.home_score,
            live_away_score: f.away_score,
            live_period: f.period,
            updated_at: new Date().toISOString(),
          })
          .eq('sportmonks_id', f.id)
      }
    }

    // 1c. Clear stale live data from any fixture that's no longer in-play
    //     (i.e. it has live_period set but is no longer in our plLive list).
    //     Stale fixtures are the strongest signal of an FT transition — the
    //     match was live, now it's gone from the inplay endpoint.
    const liveIds = new Set(liveFixtures.map((f) => f.id))
    const { data: lingering } = await supabaseServer
      .from('fixtures')
      .select('sportmonks_id')
      .not('live_period', 'is', null)
    const stale = (lingering ?? []).filter(
      (r: any) => !liveIds.has(r.sportmonks_id)
    )
    if (stale.length > 0) {
      await supabaseServer
        .from('fixtures')
        .update({
          live_home_score: null,
          live_away_score: null,
          live_minute: null,
          live_period: null,
        })
        .in(
          'sportmonks_id',
          stale.map((r: any) => r.sportmonks_id)
        )
      liveScoresChanged = true
      ftTransitionThisPoll = true
    }

    // 2. Sync standings ONLY when at least one fixture has just finished.
    //    During in-play polling we deliberately leave the standings alone so
    //    the "static" leaderboard reflects completed matches only. (If we
    //    miss a transition due to a serverless cold start, the settling-sync
    //    in the idle path picks it up next time the route goes idle.)
    let standingsChanged = false
    if (ftTransitionThisPoll) {
      const sync = await syncStandings(seasonId, teamIdBySportmonks)
      standingsChanged = sync.standingsChanged
      if (standingsChanged) {
        await recalculateAllScores('live_sync')
      }
    }

    cachedResponse = {
      live_fixtures: liveFixtures,
      has_live_matches: liveFixtures.length > 0,
      has_updates: standingsChanged || liveScoresChanged,
      idle: false,
      next_fixture_at: window.next_fixture_at,
      last_synced_at: new Date().toISOString(),
      ft_transition: ftTransitionThisPoll,
      highlights,
    }
    lastSyncAt = now

    return NextResponse.json({ ...cachedResponse, cached: false })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

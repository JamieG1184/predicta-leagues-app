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
let lastSyncAt = 0
let cachedResponse: any = null
const CACHE_MS = 30_000

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
  // Look back 3 hours (catches in-play matches that might extend with stoppage / extra time)
  const lookback = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
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
      cachedResponse = {
        live_fixtures: [],
        has_live_matches: false,
        has_updates: cleared > 0,
        idle: true,
        next_fixture_at: window.next_fixture_at,
        last_synced_at: new Date().toISOString(),
      }
      lastSyncAt = now
      return NextResponse.json({ ...cachedResponse, cached: false })
    }

    const { data: teams } = await supabaseServer
      .from('teams')
      .select('id, sportmonks_id')
    const teamIdBySportmonks = new Map(
      (teams ?? [])
        .filter((t: any) => t.sportmonks_id != null)
        .map((t: any): [number, number] => [t.sportmonks_id as number, t.id])
    )

    // 1. Fetch in-play live matches with scores include (gracefully degrades
    //    if the include is restricted on our plan)
    let inplay
    try {
      inplay = await sportmonks(`/livescores/inplay?include=scores`)
    } catch {
      inplay = await sportmonks(`/livescores/inplay`)
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

    type LiveFixture = {
      id: number
      name: string
      state_id: number
      period: string | null
      starting_at: string
      result_info: string | null
      home_score: number | null
      away_score: number | null
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
      }
    })

    // 1b. Update fixtures table with live data and detect changes
    let liveScoresChanged = false
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
    //     (i.e. it has live_period set but is no longer in our plLive list)
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
    }

    // 2. Sync standings (only updates DB if changed)
    const sync = await syncStandings(seasonId, teamIdBySportmonks)

    // 3. If standings changed, recalculate scores
    if (sync.standingsChanged) {
      await recalculateAllScores('live_sync')
    }

    cachedResponse = {
      live_fixtures: liveFixtures,
      has_live_matches: liveFixtures.length > 0,
      has_updates: sync.standingsChanged || liveScoresChanged,
      idle: false,
      next_fixture_at: window.next_fixture_at,
      last_synced_at: new Date().toISOString(),
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

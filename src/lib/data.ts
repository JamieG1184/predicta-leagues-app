// Data-access helpers used by the page components.

import { supabaseServer } from './supabase-server'
import { scorePrediction, totalForPlayer, type ScoredPrediction } from './scoring'
import { slugifyTeam } from './slugify'

export { slugifyTeam }

export type Player = {
  id: number
  display_name: string
  invite_code: string
}

export type LeaderboardRow = {
  player: Player
  rank: number
  total: number
  joker_team_name: string | null
  joker_points: number
  // Counts of picks at each scoring tier — exact_hits is kept for back
  // compatibility with anything still reading it (badges, etc.).
  exact_hits: number      // distance 0 → 5 pts each
  three_pt_hits: number   // distance 1 → 3 pts each
  one_pt_hits: number     // distance 2 → 1 pt each
  score_change: number | null
  rank_change: number | null
}

export type PlayerDetail = {
  player: Player
  rank: number
  total: number
  scored: ScoredPrediction[]
  joker_team_name: string | null
  joker_points: number
  exact_hits: number
  current_table: { position: number; team_name: string; points: number }[]
  season_name: string
  last_updated: string | null
}

async function getCurrentSeason() {
  const { data, error } = await supabaseServer
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .single()
  if (error || !data) throw new Error('No current season found')
  return data
}

async function getActualStandingsBySeason(seasonId: number) {
  const { data, error } = await supabaseServer
    .from('actual_standings')
    .select('team_id, position, points, updated_at')
    .eq('season_id', seasonId)
    .order('position')
  if (error) throw error
  return data ?? []
}

async function getTeamsById() {
  const { data, error } = await supabaseServer.from('teams').select('id, name')
  if (error) throw error
  return new Map(data.map((t) => [t.id, t.name]))
}

async function getAllPredictions(seasonId: number) {
  const { data, error } = await supabaseServer
    .from('predictions')
    .select('player_id, position, team_id, is_joker')
    .eq('season_id', seasonId)
  if (error) throw error
  return data ?? []
}

async function getAllPlayers() {
  const { data, error } = await supabaseServer
    .from('players')
    .select('id, display_name, invite_code')
    .order('display_name')
  if (error) throw error
  return (data ?? []) as Player[]
}

function scorePlayer(
  predictions: { player_id: number; position: number; team_id: number; is_joker: boolean }[],
  actualByTeamId: Map<number, number>,
  teamsById: Map<number, string>
): ScoredPrediction[] {
  return predictions
    .map((p) =>
      scorePrediction(
        { position: p.position, team_id: p.team_id, is_joker: p.is_joker },
        actualByTeamId.get(p.team_id) ?? null,
        teamsById.get(p.team_id) ?? `[id=${p.team_id}]`
      )
    )
    .sort((a, b) => a.position - b.position)
}

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const season = await getCurrentSeason()
  const [standings, teamsById, predictions, players] = await Promise.all([
    getActualStandingsBySeason(season.id),
    getTeamsById(),
    getAllPredictions(season.id),
    getAllPlayers(),
  ])
  const actualByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))

  const rows = players.map((player) => {
    const myPreds = predictions.filter((p) => p.player_id === player.id)
    const scored = scorePlayer(myPreds, actualByTeamId, teamsById)
    const total = totalForPlayer(scored)
    const jokerEntry = scored.find((s) => s.is_joker)
    const exact = scored.filter((s) => s.distance === 0).length
    const threePt = scored.filter((s) => s.distance === 1).length
    const onePt = scored.filter((s) => s.distance === 2).length
    return {
      player,
      total,
      joker_team_name: jokerEntry?.team_name ?? null,
      joker_points: jokerEntry?.points ?? 0,
      exact_hits: exact,
      three_pt_hits: threePt,
      one_pt_hits: onePt,
    }
  })

  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.joker_points - a.joker_points ||
      b.exact_hits - a.exact_hits ||
      a.player.display_name.localeCompare(b.player.display_name)
  )

  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }))

  // Layer score / rank change vs previous snapshot batch
  const batches = await getRecentSnapshotBatches()
  if (!batches || !batches.previous) {
    return ranked.map((r) => ({ ...r, score_change: null, rank_change: null }))
  }
  const prevScoreBy = new Map(batches.previous.map((s) => [s.player_id, s.live_score]))
  const prevRanked = [...batches.previous]
    .sort((a, b) => b.live_score - a.live_score)
    .map((s, i) => [s.player_id, i + 1] as [number, number])
  const prevRankBy = new Map(prevRanked)

  return ranked.map((r) => {
    const prevScore = prevScoreBy.get(r.player.id)
    const prevRank = prevRankBy.get(r.player.id)
    return {
      ...r,
      score_change: prevScore != null ? r.total - prevScore : null,
      rank_change: prevRank != null ? prevRank - r.rank : null,
    }
  })
}

export type LeagueInsights = {
  player_count: number
  league_leader: { name: string; total: number; invite_code: string } | null
  highest_joker: { player_name: string; team_name: string; points: number } | null
  total_exact_hits: number
  league_average_score: number
  most_popular_title_pick: { team_name: string; count: number; actual_position: number | null }
  most_popular_relegation_pick: { team_name: string; count: number; actual_position: number | null }
  worst_joker_strategy: { team_name: string; count: number; total_points_lost: number }
}

export async function getLeagueInsights(): Promise<LeagueInsights> {
  const board = await getLeaderboard()
  const season = await getCurrentSeason()
  const [standings, teamsById, predictions] = await Promise.all([
    getActualStandingsBySeason(season.id),
    getTeamsById(),
    getAllPredictions(season.id),
  ])
  const actualByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))

  const leader = board[0] ?? null

  // Highest single joker contribution
  let highestJoker: LeagueInsights['highest_joker'] = null
  for (const row of board) {
    if (row.joker_points > (highestJoker?.points ?? -1)) {
      highestJoker = {
        player_name: row.player.display_name,
        team_name: row.joker_team_name ?? '—',
        points: row.joker_points,
      }
    }
  }

  const totalExactHits = board.reduce((sum, r) => sum + r.exact_hits, 0)
  const avg = board.length > 0 ? Math.round(board.reduce((sum, r) => sum + r.total, 0) / board.length) : 0

  // Most popular pick at position 1 (title) and position 20 (relegation)
  const titleCounts = new Map<number, number>()
  const relegationCounts = new Map<number, number>()
  for (const p of predictions) {
    if (p.position === 1) titleCounts.set(p.team_id, (titleCounts.get(p.team_id) ?? 0) + 1)
    if (p.position === 20) relegationCounts.set(p.team_id, (relegationCounts.get(p.team_id) ?? 0) + 1)
  }
  const topTitleEntry = [...titleCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const topRelegationEntry = [...relegationCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  const titlePick = topTitleEntry
    ? {
        team_name: teamsById.get(topTitleEntry[0]) ?? '?',
        count: topTitleEntry[1],
        actual_position: actualByTeamId.get(topTitleEntry[0]) ?? null,
      }
    : { team_name: '—', count: 0, actual_position: null }
  const relegationPick = topRelegationEntry
    ? {
        team_name: teamsById.get(topRelegationEntry[0]) ?? '?',
        count: topRelegationEntry[1],
        actual_position: actualByTeamId.get(topRelegationEntry[0]) ?? null,
      }
    : { team_name: '—', count: 0, actual_position: null }

  // Worst Joker strategy — the team most picked as Joker that scored the lowest total
  const jokerStats = new Map<number, { count: number; total: number }>()
  for (const row of board) {
    const jokerPred = predictions.find((p) => p.player_id === row.player.id && p.is_joker)
    if (!jokerPred) continue
    const cur = jokerStats.get(jokerPred.team_id) ?? { count: 0, total: 0 }
    jokerStats.set(jokerPred.team_id, {
      count: cur.count + 1,
      total: cur.total + row.joker_points,
    })
  }
  let worstJoker: LeagueInsights['worst_joker_strategy'] = {
    team_name: '—',
    count: 0,
    total_points_lost: 0,
  }
  for (const [teamId, stat] of jokerStats) {
    if (stat.count >= 3 && stat.total < (worstJoker.count > 0 ? worstJoker.total_points_lost : Infinity)) {
      worstJoker = {
        team_name: teamsById.get(teamId) ?? '?',
        count: stat.count,
        total_points_lost: stat.total,
      }
    }
  }

  return {
    player_count: board.length,
    league_leader: leader
      ? { name: leader.player.display_name, total: leader.total, invite_code: leader.player.invite_code }
      : null,
    highest_joker: highestJoker,
    total_exact_hits: totalExactHits,
    league_average_score: avg,
    most_popular_title_pick: titlePick,
    most_popular_relegation_pick: relegationPick,
    worst_joker_strategy: worstJoker,
  }
}

// ---------------------------------------------------------------------------
// Live-projected leaderboard
// ---------------------------------------------------------------------------
//
// "Projection" means: take the current PL standings, layer on the in-play
// match scores AS IF those matches ended right now (3 pts for the leading
// team, 1 each on a draw), re-rank teams, then recompute every player's
// prediction score against that projected table.
//
// Result feeds the homepage's opt-in "Live projection" toggle so engaged
// players can watch the leaderboard shift during match windows. It does NOT
// touch any persisted data — purely a derived view.
//
// Tiebreak note: the actual_standings table doesn't currently track goal
// difference (it's stored as 0 for all teams). When projected points tie, we
// fall back to the team's original PL position, which preserves whatever GD
// ordering was in place pre-projection. Good enough for v1.

export type ProjectedLeaderboardRow = {
  player: Player
  rank: number
  total: number
  joker_team_name: string | null
  joker_points: number
  exact_hits: number
  three_pt_hits: number
  one_pt_hits: number
}

export type ProjectedLeaderboardResult = {
  rows: ProjectedLeaderboardRow[]
  in_play_count: number
  fetched_at: string
  has_projection: boolean // false when no in-play fixtures
}

async function getInPlayPLFixtures(seasonId: number) {
  const { data, error } = await supabaseServer
    .from('fixtures')
    .select(
      'sportmonks_id, home_team_id, away_team_id, live_home_score, live_away_score, live_period'
    )
    .eq('season_id', seasonId)
    .not('live_period', 'is', null)
    .neq('state_id', 5) // exclude FT
  if (error) throw error
  return data ?? []
}

export async function getProjectedLeaderboard(): Promise<ProjectedLeaderboardResult> {
  const season = await getCurrentSeason()
  const [actual, teamsById, predictions, players, livePLFixtures] = await Promise.all([
    getActualStandingsBySeason(season.id),
    getTeamsById(),
    getAllPredictions(season.id),
    getAllPlayers(),
    getInPlayPLFixtures(season.id),
  ])

  // Mutable copy of the standings for projection.
  const teamStanding = new Map<number, { points: number; originalPosition: number }>()
  for (const s of actual) {
    teamStanding.set(s.team_id, { points: s.points, originalPosition: s.position })
  }

  // Apply each in-play fixture's projected outcome.
  for (const f of livePLFixtures) {
    if (f.home_team_id == null || f.away_team_id == null) continue
    if (f.live_home_score == null || f.live_away_score == null) continue
    const home = teamStanding.get(f.home_team_id)
    const away = teamStanding.get(f.away_team_id)
    if (!home || !away) continue
    if (f.live_home_score > f.live_away_score) {
      home.points += 3
    } else if (f.live_home_score < f.live_away_score) {
      away.points += 3
    } else {
      home.points += 1
      away.points += 1
    }
  }

  // Re-rank by projected points (tiebreak: pre-projection position).
  const projected = [...teamStanding.entries()]
    .map(([team_id, v]) => ({ team_id, points: v.points, originalPosition: v.originalPosition }))
    .sort((a, b) => b.points - a.points || a.originalPosition - b.originalPosition)
  const projectedByTeamId = new Map<number, number>()
  projected.forEach((p, i) => projectedByTeamId.set(p.team_id, i + 1))

  const rows = players.map((player) => {
    const myPreds = predictions.filter((p) => p.player_id === player.id)
    const scored = scorePlayer(myPreds, projectedByTeamId, teamsById)
    const total = totalForPlayer(scored)
    const jokerEntry = scored.find((s) => s.is_joker)
    const exact = scored.filter((s) => s.distance === 0).length
    const threePt = scored.filter((s) => s.distance === 1).length
    const onePt = scored.filter((s) => s.distance === 2).length
    return {
      player,
      total,
      joker_team_name: jokerEntry?.team_name ?? null,
      joker_points: jokerEntry?.points ?? 0,
      exact_hits: exact,
      three_pt_hits: threePt,
      one_pt_hits: onePt,
    }
  })

  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.joker_points - a.joker_points ||
      b.exact_hits - a.exact_hits ||
      a.player.display_name.localeCompare(b.player.display_name)
  )

  const ranked: ProjectedLeaderboardRow[] = rows.map((r, i) => ({ ...r, rank: i + 1 }))

  return {
    rows: ranked,
    in_play_count: livePLFixtures.length,
    fetched_at: new Date().toISOString(),
    has_projection: livePLFixtures.length > 0,
  }
}

// ---------------------------------------------------------------------------
// Last score update timestamp (most recent score_snapshots row)
// ---------------------------------------------------------------------------
//
// Used by the "Latest movements" header on the homepage so players can see
// exactly when the rank changes were calculated.

export async function getLastScoreUpdateTime(): Promise<string | null> {
  const season = await getCurrentSeason()
  const { data, error } = await supabaseServer
    .from('score_snapshots')
    .select('snapshot_at')
    .eq('season_id', season.id)
    .order('snapshot_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data && data.length > 0 ? data[0].snapshot_at : null
}

// ---------------------------------------------------------------------------
// Daily score insights (rolled up from score_snapshots by calendar day)
// ---------------------------------------------------------------------------
//
// "Daily score" = how much a player's cumulative score CHANGED on a given
// calendar day versus the previous scoring day. The very first scoring day in
// the season is treated as the baseline and excluded from deltas (we can't
// compute a delta with no prior).
//
// Snapshots come from `npm run scores:calculate` (one row per player per
// calculation event). For days with multiple snapshots, we use that day's
// LAST cumulative_score. For days where a player has no snapshot but the
// league does, we carry forward their last known score (so their delta on
// that day is 0).

export type DailyScoreInsights = {
  league_avg_per_day: number
  highest_mean_player: { name: string; mean_per_day: number; days: number } | null
  highest_single_day: { player_name: string; delta: number; date: string } | null
  lowest_single_day: { player_name: string; delta: number; date: string } | null
  scoring_days: number
}

export async function getDailyScoreInsights(): Promise<DailyScoreInsights> {
  const season = await getCurrentSeason()
  const players = await getAllPlayers()
  const playerById = new Map(players.map((p) => [p.id, p]))

  const { data: snaps, error } = await supabaseServer
    .from('score_snapshots')
    .select('player_id, cumulative_score, snapshot_at')
    .eq('season_id', season.id)
    .order('snapshot_at', { ascending: true })
  if (error) throw error

  const empty: DailyScoreInsights = {
    league_avg_per_day: 0,
    highest_mean_player: null,
    highest_single_day: null,
    lowest_single_day: null,
    scoring_days: 0,
  }
  if (!snaps || snaps.length === 0) return empty

  // For each (player, calendar_date), keep the LAST cumulative_score that day.
  const playerDateScores = new Map<number, Map<string, number>>()
  const allDatesSet = new Set<string>()
  for (const s of snaps) {
    const date = String(s.snapshot_at).slice(0, 10) // YYYY-MM-DD
    allDatesSet.add(date)
    if (!playerDateScores.has(s.player_id)) playerDateScores.set(s.player_id, new Map())
    playerDateScores.get(s.player_id)!.set(date, s.cumulative_score)
  }

  const allDates = [...allDatesSet].sort()
  if (allDates.length < 2) return { ...empty, scoring_days: 0 }

  // Carry-forward fill: if a player missed a league date, use their last known score.
  for (const [, dateMap] of playerDateScores) {
    let lastScore: number | null = null
    for (const date of allDates) {
      if (dateMap.has(date)) {
        lastScore = dateMap.get(date)!
      } else if (lastScore != null) {
        dateMap.set(date, lastScore)
      }
    }
  }

  // Compute deltas, skipping the baseline (first) date.
  type Delta = { player_id: number; date: string; delta: number }
  const deltas: Delta[] = []
  for (const [playerId, dateMap] of playerDateScores) {
    for (let i = 1; i < allDates.length; i++) {
      const today = dateMap.get(allDates[i])
      const yesterday = dateMap.get(allDates[i - 1])
      if (today == null || yesterday == null) continue
      deltas.push({ player_id: playerId, date: allDates[i], delta: today - yesterday })
    }
  }
  if (deltas.length === 0) return { ...empty, scoring_days: allDates.length - 1 }

  // League average across all (player, day) deltas.
  const leagueAvg = deltas.reduce((s, d) => s + d.delta, 0) / deltas.length

  // Per-player mean — pick the player with the highest mean.
  const playerAgg = new Map<number, { sum: number; n: number }>()
  for (const d of deltas) {
    const cur = playerAgg.get(d.player_id) ?? { sum: 0, n: 0 }
    playerAgg.set(d.player_id, { sum: cur.sum + d.delta, n: cur.n + 1 })
  }
  let highestMean: DailyScoreInsights['highest_mean_player'] = null
  for (const [playerId, agg] of playerAgg) {
    const mean = agg.sum / agg.n
    if (highestMean == null || mean > highestMean.mean_per_day) {
      highestMean = {
        name: playerById.get(playerId)?.display_name ?? '?',
        mean_per_day: Math.round(mean * 10) / 10,
        days: agg.n,
      }
    }
  }

  // Single best and worst day.
  let highestSingle: Delta | null = null
  let lowestSingle: Delta | null = null
  for (const d of deltas) {
    if (highestSingle == null || d.delta > highestSingle.delta) highestSingle = d
    if (lowestSingle == null || d.delta < lowestSingle.delta) lowestSingle = d
  }

  return {
    league_avg_per_day: Math.round(leagueAvg * 10) / 10,
    highest_mean_player: highestMean,
    highest_single_day: highestSingle
      ? {
          player_name: playerById.get(highestSingle.player_id)?.display_name ?? '?',
          delta: highestSingle.delta,
          date: highestSingle.date,
        }
      : null,
    lowest_single_day: lowestSingle
      ? {
          player_name: playerById.get(lowestSingle.player_id)?.display_name ?? '?',
          delta: lowestSingle.delta,
          date: lowestSingle.date,
        }
      : null,
    scoring_days: allDates.length - 1,
  }
}

export async function getPlayerDetail(inviteCode: string): Promise<PlayerDetail | null> {
  const season = await getCurrentSeason()
  const [standings, teamsById, predictions, players] = await Promise.all([
    getActualStandingsBySeason(season.id),
    getTeamsById(),
    getAllPredictions(season.id),
    getAllPlayers(),
  ])
  const player = players.find((p) => p.invite_code.toUpperCase() === inviteCode.toUpperCase())
  if (!player) return null

  const actualByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))
  const myPreds = predictions.filter((p) => p.player_id === player.id)
  const scored = scorePlayer(myPreds, actualByTeamId, teamsById)
  const total = totalForPlayer(scored)
  const jokerEntry = scored.find((s) => s.is_joker)
  const exact = scored.filter((s) => s.distance === 0).length

  // Compute rank by recomputing the leaderboard (fast — only 30 players)
  const board = await getLeaderboard()
  const rank = board.find((r) => r.player.id === player.id)?.rank ?? 0

  const currentTable = standings.map((s) => ({
    position: s.position,
    team_name: teamsById.get(s.team_id) ?? `[id=${s.team_id}]`,
    points: s.points,
  }))

  return {
    player,
    rank,
    total,
    scored,
    joker_team_name: jokerEntry?.team_name ?? null,
    joker_points: jokerEntry?.points ?? 0,
    exact_hits: exact,
    current_table: currentTable,
    season_name: season.name,
    last_updated: standings[0]?.updated_at ?? null,
  }
}

// ---------------------------------------------------------------------------
// Team detail page
// ---------------------------------------------------------------------------

export type TeamDetail = {
  team: { id: number; name: string; slug: string }
  actual_position: number | null
  actual_points: number | null
  prediction_count: number
  joker_count: number
  average_predicted_position: number | null
  most_popular_predicted_position: number | null
  distribution: { position: number; count: number }[]
  player_picks: {
    player_name: string
    invite_code: string
    predicted_position: number
    distance: number | null
    points: number
    is_joker: boolean
  }[]
}

export async function getTeamDetail(slug: string): Promise<TeamDetail | null> {
  const season = await getCurrentSeason()
  const [standings, teamsById, predictions, players] = await Promise.all([
    getActualStandingsBySeason(season.id),
    getTeamsById(),
    getAllPredictions(season.id),
    getAllPlayers(),
  ])

  const allTeams = [...teamsById.entries()].map(([id, name]) => ({
    id,
    name,
    slug: slugifyTeam(name),
  }))
  const team = allTeams.find((t) => t.slug === slug)
  if (!team) return null

  const standingRow = standings.find((s) => s.team_id === team.id)
  const actualPos = standingRow?.position ?? null
  const actualPts = standingRow?.points ?? null

  const teamPredictions = predictions.filter((p) => p.team_id === team.id)
  const playerById = new Map(players.map((p) => [p.id, p]))

  // Distribution: how many players predicted this team at each position
  const dist = new Map<number, number>()
  for (const p of teamPredictions) dist.set(p.position, (dist.get(p.position) ?? 0) + 1)
  const distribution = [...Array(20)].map((_, i) => ({
    position: i + 1,
    count: dist.get(i + 1) ?? 0,
  }))

  let mostPopular: number | null = null
  let mostPopularCount = 0
  for (const d of distribution) {
    if (d.count > mostPopularCount) {
      mostPopular = d.position
      mostPopularCount = d.count
    }
  }

  const avgPos = teamPredictions.length
    ? teamPredictions.reduce((sum, p) => sum + p.position, 0) / teamPredictions.length
    : null

  const jokerCount = teamPredictions.filter((p) => p.is_joker).length

  const playerPicks = teamPredictions.map((p) => {
    const distance = actualPos != null ? Math.abs(p.position - actualPos) : null
    const base = distance == null ? 0 : distance === 0 ? 5 : distance === 1 ? 3 : distance === 2 ? 1 : 0
    const points = p.is_joker ? base * 2 : base
    return {
      player_name: playerById.get(p.player_id)?.display_name ?? '?',
      invite_code: playerById.get(p.player_id)?.invite_code ?? '',
      predicted_position: p.position,
      distance,
      points,
      is_joker: p.is_joker,
    }
  })
  playerPicks.sort((a, b) => a.predicted_position - b.predicted_position || a.player_name.localeCompare(b.player_name))

  return {
    team,
    actual_position: actualPos,
    actual_points: actualPts,
    prediction_count: teamPredictions.length,
    joker_count: jokerCount,
    average_predicted_position: avgPos != null ? Math.round(avgPos * 10) / 10 : null,
    most_popular_predicted_position: mostPopular,
    distribution,
    player_picks: playerPicks,
  }
}

export async function getAllTeamSlugs(): Promise<{ slug: string; name: string }[]> {
  const teamsById = await getTeamsById()
  return [...teamsById.values()]
    .map((name) => ({ name, slug: slugifyTeam(name) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type FeedbackEntry = {
  id: number
  player_name: string | null
  category: string | null
  message: string
  resolved: boolean
  submitted_at: string
}

export async function submitFeedback(args: {
  player_name?: string | null
  category?: string | null
  message: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const message = args.message?.trim()
  if (!message) return { ok: false, error: 'Message is required.' }
  if (message.length > 2000) return { ok: false, error: 'Message is too long (max 2000 characters).' }
  const { error } = await supabaseServer.from('feedback').insert({
    player_name: args.player_name?.trim() || null,
    category: args.category?.trim() || null,
    message,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAllFeedback(): Promise<FeedbackEntry[]> {
  const { data, error } = await supabaseServer
    .from('feedback')
    .select('*')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as FeedbackEntry[]
}

export async function setFeedbackResolved(id: number, resolved: boolean) {
  const { error } = await supabaseServer
    .from('feedback')
    .update({ resolved })
    .eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Weekly badges
// ---------------------------------------------------------------------------

export type BadgeType =
  | 'top_of_league'
  | 'bottom_of_league'
  | 'highest_climber'
  | 'biggest_drop'
  | 'highest_weekly_score'
  | 'lowest_weekly_score'

export const BADGE_LABELS: Record<BadgeType, { label: string; emoji: string; tone: 'good' | 'bad' }> = {
  top_of_league: { label: "Blagger's Right", emoji: '🏆', tone: 'good' },
  bottom_of_league: { label: 'Wanker of the Week', emoji: '🤡', tone: 'bad' },
  highest_climber: { label: 'Highest Climber', emoji: '📈', tone: 'good' },
  biggest_drop: { label: 'Biggest Drop', emoji: '📉', tone: 'bad' },
  highest_weekly_score: { label: 'Highest Weekly Score', emoji: '🎯', tone: 'good' },
  lowest_weekly_score: { label: 'Lowest Weekly Score', emoji: '💀', tone: 'bad' },
}

export type WeeklyBadge = {
  id: number
  week_ending: string
  week_label: string | null
  badge_type: BadgeType
  player_id: number
  player_name: string
  invite_code: string
  value: number | null
  notes: string | null
}

export async function getPlayerBadges(playerId: number): Promise<WeeklyBadge[]> {
  const season = await getCurrentSeason()
  const { data } = await supabaseServer
    .from('weekly_badges')
    .select('id, week_ending, week_label, badge_type, value, notes, player_id')
    .eq('season_id', season.id)
    .eq('player_id', playerId)
    .order('week_ending', { ascending: false })
  if (!data) return []
  const players = await getAllPlayers()
  const player = players.find((p) => p.id === playerId)
  return data.map((b) => ({
    id: b.id,
    week_ending: b.week_ending,
    week_label: b.week_label,
    badge_type: b.badge_type as BadgeType,
    player_id: b.player_id,
    player_name: player?.display_name ?? '?',
    invite_code: player?.invite_code ?? '',
    value: b.value,
    notes: b.notes,
  }))
}

export async function getLatestWeekBadges(): Promise<WeeklyBadge[]> {
  const season = await getCurrentSeason()
  // Find the most recent week_ending
  const { data: latest } = await supabaseServer
    .from('weekly_badges')
    .select('week_ending')
    .eq('season_id', season.id)
    .order('week_ending', { ascending: false })
    .limit(1)
  if (!latest || latest.length === 0) return []
  const weekEnding = latest[0].week_ending
  const { data } = await supabaseServer
    .from('weekly_badges')
    .select('id, week_ending, week_label, badge_type, value, notes, player_id')
    .eq('season_id', season.id)
    .eq('week_ending', weekEnding)
  if (!data) return []
  const players = await getAllPlayers()
  return data.map((b) => {
    const player = players.find((p) => p.id === b.player_id)
    return {
      id: b.id,
      week_ending: b.week_ending,
      week_label: b.week_label,
      badge_type: b.badge_type as BadgeType,
      player_id: b.player_id,
      player_name: player?.display_name ?? '?',
      invite_code: player?.invite_code ?? '',
      value: b.value,
      notes: b.notes,
    }
  })
}

// ---------------------------------------------------------------------------
// Live in-play fixtures (for homepage and digest "live now" strip)
// ---------------------------------------------------------------------------

export type InPlayFixture = {
  fixture_id: number
  fixture_name: string
  starting_at: string
  home_team_name: string
  away_team_name: string
  live_home_score: number | null
  live_away_score: number | null
  live_period: string
}

export async function getInPlayFixtures(): Promise<InPlayFixture[]> {
  const season = await getCurrentSeason()
  const teamsById = await getTeamsById()
  const { data, error } = await supabaseServer
    .from('fixtures')
    .select(
      'id, home_team_id, away_team_id, live_home_score, live_away_score, live_period, fixture_name, starting_at'
    )
    .eq('season_id', season.id)
    .not('live_period', 'is', null)
    .neq('live_period', 'FT')
    .order('starting_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((f) => ({
    fixture_id: f.id,
    fixture_name: f.fixture_name ?? '',
    starting_at: f.starting_at,
    home_team_name: f.home_team_id != null ? teamsById.get(f.home_team_id) ?? '?' : '?',
    away_team_name: f.away_team_id != null ? teamsById.get(f.away_team_id) ?? '?' : '?',
    live_home_score: f.live_home_score,
    live_away_score: f.live_away_score,
    live_period: f.live_period as string,
  }))
}

// ---------------------------------------------------------------------------
// Daily digest
// ---------------------------------------------------------------------------

export type DigestMovement = {
  player_id: number
  player_name: string
  invite_code: string
  rank_before: number | null
  rank_after: number
  rank_change: number // positive = climbed
  score_before: number | null
  score_after: number
  score_change: number
  joker_team_name: string | null
}

export type DigestFixture = {
  fixture_name: string
  starting_at: string
  result_info: string | null
  home_team_name: string | null
  away_team_name: string | null
  home_actual_position: number | null
  away_actual_position: number | null
  home_predicted_mean: number | null
  away_predicted_mean: number | null
  home_joker_count: number
  away_joker_count: number
  winner: 'home' | 'away' | 'draw' | 'unknown'
  analysis: string
}

export type DailyDigest =
  | {
      has_data: false
      reason: string
    }
  | {
      has_data: true
      period_start: string
      period_end: string
      hours_between: number
      fixtures_played: DigestFixture[]
      movements: DigestMovement[]
      biggest_gainer: DigestMovement | null
      biggest_loser: DigestMovement | null
      league_leader: DigestMovement | null
      previous_leader_name: string | null
      total_points_changed: number
      avg_score_now: number
      avg_score_then: number
      narrative_segments: string[]
    }

async function getRecentSnapshotBatches() {
  const { data, error } = await supabaseServer
    .from('score_snapshots')
    .select('player_id, season_id, live_score, cumulative_score, snapshot_at')
    .order('snapshot_at', { ascending: false })
    .limit(120)
  if (error) throw error
  if (!data || data.length === 0) return null

  const byTime = new Map<string, typeof data>()
  for (const row of data) {
    if (!byTime.has(row.snapshot_at)) byTime.set(row.snapshot_at, [])
    byTime.get(row.snapshot_at)!.push(row)
  }
  const sortedTimes = [...byTime.keys()].sort().reverse()
  const current = byTime.get(sortedTimes[0]) ?? []
  const previousTime = sortedTimes[1]
  const previous = previousTime ? byTime.get(previousTime) ?? null : null
  return {
    current,
    previous,
    currentTime: sortedTimes[0],
    previousTime: previousTime ?? null,
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function inferFixtureWinner(
  homeName: string | null,
  awayName: string | null,
  resultInfo: string | null
): 'home' | 'away' | 'draw' | 'unknown' {
  if (!resultInfo) return 'unknown'
  const ri = resultInfo.toLowerCase()
  if (ri.includes('draw') || ri.includes('drew') || ri.includes('ended in a tie')) return 'draw'
  if (homeName && ri.includes(homeName.toLowerCase()) && ri.includes('won')) return 'home'
  if (awayName && ri.includes(awayName.toLowerCase()) && ri.includes('won')) return 'away'
  if (ri.includes('won')) return 'away' // last-resort heuristic
  return 'unknown'
}

function generateNarrative(
  movements: DigestMovement[],
  fixtures: DigestFixture[],
  leader: DigestMovement | null,
  previousLeaderName: string | null
): string[] {
  const segments: string[] = []

  // Period overview
  if (fixtures.length === 0) {
    segments.push(
      'No Premier League fixtures fell within this period. League standings and player scores remain unchanged.'
    )
    return segments
  }

  segments.push(
    `${fixtures.length} ${fixtures.length === 1 ? 'fixture' : 'fixtures'} were played in this period, generating measurable shifts in the league standings and consequently in player scores.`
  )

  // Leader analysis
  if (leader) {
    if (previousLeaderName && previousLeaderName !== leader.player_name) {
      segments.push(
        `Leadership change: ${leader.player_name} now occupies the top position with ${leader.score_after} points, replacing ${previousLeaderName} as the league leader.`
      )
    } else if (leader.score_change > 0) {
      segments.push(
        `${leader.player_name} retains first place on ${leader.score_after} points, extending the margin by ${leader.score_change} ${
          leader.score_change === 1 ? 'point' : 'points'
        } this period.`
      )
    } else if (leader.score_change < 0) {
      segments.push(
        `${leader.player_name} retains first place on ${leader.score_after} points despite a ${leader.score_change}-point decline, narrowing the lead over the chasing field.`
      )
    } else {
      segments.push(
        `${leader.player_name} retains first place on ${leader.score_after} points; no change this period.`
      )
    }
  }

  // Top performer
  const sortedByGain = [...movements].sort((a, b) => b.score_change - a.score_change)
  const top = sortedByGain[0]
  if (top && top.score_change > 0) {
    const rankNote =
      top.rank_change > 0
        ? `, advancing ${top.rank_change} ${top.rank_change === 1 ? 'position' : 'positions'} to ${ordinal(top.rank_after)}`
        : ''
    segments.push(
      `Top performer: ${top.player_name} gained +${top.score_change} ${
        top.score_change === 1 ? 'point' : 'points'
      }${rankNote}.`
    )
  }

  // Largest decline
  const bottom = sortedByGain[sortedByGain.length - 1]
  if (bottom && bottom.score_change < 0) {
    const rankNote =
      bottom.rank_change < 0
        ? `, dropping ${Math.abs(bottom.rank_change)} ${Math.abs(bottom.rank_change) === 1 ? 'position' : 'positions'} to ${ordinal(bottom.rank_after)}`
        : ''
    segments.push(
      `Largest decline: ${bottom.player_name} lost ${Math.abs(bottom.score_change)} ${
        Math.abs(bottom.score_change) === 1 ? 'point' : 'points'
      }${rankNote}.`
    )
  }

  // Joker yield
  const jokerWinners = sortedByGain.filter((m) => m.joker_team_name && m.score_change > 2)
  const jokerLosers = sortedByGain.filter((m) => m.joker_team_name && m.score_change < -2)
  if (jokerWinners.length > 0) {
    const j = jokerWinners[0]
    segments.push(
      `Joker yield: ${j.player_name}'s ${j.joker_team_name} selection contributed +${j.score_change} ${
        j.score_change === 1 ? 'point' : 'points'
      } this period, the strongest Joker performance in the league.`
    )
  } else if (jokerLosers.length > 0) {
    const j = jokerLosers[0]
    segments.push(
      `Joker drag: ${j.player_name}'s ${j.joker_team_name} selection generated a ${j.score_change}-point loss this period. The doubled multiplier amplified the negative outcome.`
    )
  }

  // League-wide volatility
  const movers = movements.filter((m) => Math.abs(m.score_change) > 0).length
  if (movers >= 5) {
    const movedPct = Math.round((movers / movements.length) * 100)
    segments.push(
      `Period volatility: ${movers} of ${movements.length} players (${movedPct}%) registered a score change. The leaderboard reordering reflects the cumulative impact of this period's results.`
    )
  }

  return segments
}

export async function getDailyDigest(): Promise<DailyDigest> {
  const season = await getCurrentSeason()
  const batches = await getRecentSnapshotBatches()

  if (!batches) {
    return {
      has_data: false,
      reason: 'No score snapshots yet. Run "npm run scores:calculate" once first.',
    }
  }
  if (!batches.previous || !batches.previousTime) {
    return {
      has_data: false,
      reason:
        'Only one snapshot exists so far. Run "npm run digest:snapshot" again later (after some fixtures have played) to generate the first comparison.',
    }
  }

  const players = await getAllPlayers()
  const playerById = new Map(players.map((p) => [p.id, p]))
  const teamsById = await getTeamsById()
  const predictions = await getAllPredictions(season.id)

  // Joker per player
  const jokerByPlayerId = new Map<number, string>()
  for (const p of predictions) {
    if (p.is_joker) jokerByPlayerId.set(p.player_id, teamsById.get(p.team_id) ?? '?')
  }

  // Rank both batches
  const rankBatch = (batch: typeof batches.current) =>
    new Map(
      [...batch].sort((a, b) => b.live_score - a.live_score).map((s, i) => [s.player_id, i + 1])
    )
  const currentRanks = rankBatch(batches.current)
  const previousRanks = rankBatch(batches.previous)
  const previousByPlayerId = new Map(batches.previous.map((s) => [s.player_id, s]))

  const movements: DigestMovement[] = batches.current.map((cur) => {
    const prev = previousByPlayerId.get(cur.player_id)
    const player = playerById.get(cur.player_id)
    const rankAfter = currentRanks.get(cur.player_id) ?? 0
    const rankBefore = previousRanks.get(cur.player_id) ?? null
    return {
      player_id: cur.player_id,
      player_name: player?.display_name ?? '?',
      invite_code: player?.invite_code ?? '',
      rank_before: rankBefore,
      rank_after: rankAfter,
      rank_change: rankBefore != null ? rankBefore - rankAfter : 0,
      score_before: prev?.live_score ?? null,
      score_after: cur.live_score,
      score_change: prev ? cur.live_score - prev.live_score : 0,
      joker_team_name: jokerByPlayerId.get(cur.player_id) ?? null,
    }
  })

  movements.sort((a, b) => b.score_after - a.score_after)
  const sortedByGain = [...movements].sort((a, b) => b.score_change - a.score_change)
  const biggestGainer = sortedByGain[0] && sortedByGain[0].score_change > 0 ? sortedByGain[0] : null
  const biggestLoser =
    sortedByGain[sortedByGain.length - 1] && sortedByGain[sortedByGain.length - 1].score_change < 0
      ? sortedByGain[sortedByGain.length - 1]
      : null

  const leader = movements[0] ?? null
  const previousLeader =
    [...previousRanks.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? null
  const previousLeaderName = previousLeader ? playerById.get(previousLeader)?.display_name ?? null : null

  // Fixtures played in the period
  const { data: fixtures } = await supabaseServer
    .from('fixtures')
    .select('fixture_name, starting_at, result_info, state_id, home_team_id, away_team_id')
    .eq('season_id', season.id)
    .eq('state_id', 5)
    .gte('starting_at', batches.previousTime)
    .lte('starting_at', batches.currentTime)
    .order('starting_at', { ascending: false })

  const totalPointsChanged = movements.reduce((sum, m) => sum + Math.abs(m.score_change), 0)
  const avgNow = movements.reduce((sum, m) => sum + m.score_after, 0) / Math.max(1, movements.length)
  const avgThen =
    movements.reduce((sum, m) => sum + (m.score_before ?? m.score_after), 0) /
    Math.max(1, movements.length)

  const hoursBetween =
    (new Date(batches.currentTime).getTime() - new Date(batches.previousTime).getTime()) /
    (1000 * 60 * 60)

  // Standings lookup for analysis
  const standings = await getActualStandingsBySeason(season.id)
  const actualPosByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))

  // Build per-team prediction stats from the predictions array
  const predictionsByTeamId = new Map<number, Array<{ position: number; is_joker: boolean }>>()
  for (const p of predictions) {
    if (!predictionsByTeamId.has(p.team_id)) predictionsByTeamId.set(p.team_id, [])
    predictionsByTeamId.get(p.team_id)!.push({ position: p.position, is_joker: p.is_joker })
  }

  function statsForTeam(teamId: number | null) {
    if (teamId == null) return { mean: null, joker_count: 0 }
    const list = predictionsByTeamId.get(teamId) ?? []
    if (list.length === 0) return { mean: null, joker_count: 0 }
    const mean = list.reduce((sum, p) => sum + p.position, 0) / list.length
    const jokerCount = list.filter((p) => p.is_joker).length
    return { mean: Math.round(mean * 10) / 10, joker_count: jokerCount }
  }


  function generateFixtureAnalysis(args: {
    homeName: string | null
    awayName: string | null
    homeActual: number | null
    awayActual: number | null
    homeStats: { mean: number | null; joker_count: number }
    awayStats: { mean: number | null; joker_count: number }
    winner: DigestFixture['winner']
  }): string {
    const { homeName, awayName, homeActual, awayActual, homeStats, awayStats, winner } = args
    const parts: string[] = []

    if (homeName && homeActual != null && homeStats.mean != null) {
      const delta = homeActual - homeStats.mean
      const direction = delta > 0.5 ? 'below' : delta < -0.5 ? 'above' : 'in line with'
      parts.push(
        `${homeName} sits at position ${homeActual}, ${direction} the league mean prediction of ${homeStats.mean}.`
      )
    }
    if (awayName && awayActual != null && awayStats.mean != null) {
      const delta = awayActual - awayStats.mean
      const direction = delta > 0.5 ? 'below' : delta < -0.5 ? 'above' : 'in line with'
      parts.push(
        `${awayName} sits at position ${awayActual}, ${direction} the league mean prediction of ${awayStats.mean}.`
      )
    }

    const jokerNotes: string[] = []
    if (homeStats.joker_count > 0 && homeName) {
      jokerNotes.push(`${homeStats.joker_count} ${homeStats.joker_count === 1 ? 'player holds' : 'players hold'} ${homeName} as Joker`)
    }
    if (awayStats.joker_count > 0 && awayName) {
      jokerNotes.push(`${awayStats.joker_count} ${awayStats.joker_count === 1 ? 'player holds' : 'players hold'} ${awayName} as Joker`)
    }
    if (jokerNotes.length > 0) parts.push(`Joker exposure: ${jokerNotes.join('; ')}.`)

    if (winner === 'draw') parts.push('A draw delivers no points to either side and limits position movement.')

    return parts.join(' ')
  }

  const digestFixtures: DigestFixture[] = (fixtures ?? []).map((f) => {
    const homeName = f.home_team_id != null ? teamsById.get(f.home_team_id) ?? null : null
    const awayName = f.away_team_id != null ? teamsById.get(f.away_team_id) ?? null : null
    const homeActual = f.home_team_id != null ? actualPosByTeamId.get(f.home_team_id) ?? null : null
    const awayActual = f.away_team_id != null ? actualPosByTeamId.get(f.away_team_id) ?? null : null
    const homeStats = statsForTeam(f.home_team_id)
    const awayStats = statsForTeam(f.away_team_id)
    const winner = inferFixtureWinner(homeName, awayName, f.result_info)
    const analysis = generateFixtureAnalysis({
      homeName,
      awayName,
      homeActual,
      awayActual,
      homeStats,
      awayStats,
      winner,
    })
    return {
      fixture_name: f.fixture_name ?? 'Premier League fixture',
      starting_at: f.starting_at,
      result_info: f.result_info,
      home_team_name: homeName,
      away_team_name: awayName,
      home_actual_position: homeActual,
      away_actual_position: awayActual,
      home_predicted_mean: homeStats.mean,
      away_predicted_mean: awayStats.mean,
      home_joker_count: homeStats.joker_count,
      away_joker_count: awayStats.joker_count,
      winner,
      analysis,
    }
  })

  return {
    has_data: true,
    period_start: batches.previousTime,
    period_end: batches.currentTime,
    hours_between: Math.round(hoursBetween * 10) / 10,
    fixtures_played: digestFixtures,
    movements,
    biggest_gainer: biggestGainer,
    biggest_loser: biggestLoser,
    league_leader: leader,
    previous_leader_name: previousLeaderName,
    total_points_changed: totalPointsChanged,
    avg_score_now: Math.round(avgNow * 10) / 10,
    avg_score_then: Math.round(avgThen * 10) / 10,
    narrative_segments: generateNarrative(movements, digestFixtures, leader, previousLeaderName),
  }
}

// ---------------------------------------------------------------------------
// Original predictions (loaded from the seed JSON)
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join } from 'path'

export type OriginalPrediction = {
  position: number
  team_name: string
  is_joker: boolean
}

let _originalsByName: Map<string, OriginalPrediction[]> | null = null

function loadOriginalsFromSeed(): Map<string, OriginalPrediction[]> {
  if (_originalsByName) return _originalsByName
  const seedPath = join(process.cwd(), 'seed-data-2025-26.json')
  const raw = readFileSync(seedPath, 'utf-8')
  const seed = JSON.parse(raw)
  const map = new Map<string, OriginalPrediction[]>()
  for (const player of seed.players ?? []) {
    map.set(
      player.name,
      (player.predictions ?? []).map((p: any) => ({
        position: p.position,
        team_name: p.team,
        is_joker: p.team === player.joker_team,
      }))
    )
  }
  _originalsByName = map
  return map
}

/**
 * Look up a player's original (pre-shift) prediction list from the seed file.
 * Returns null if the player has no original on file (e.g. excluded players).
 */
export function getOriginalPredictionByName(playerName: string): OriginalPrediction[] | null {
  const map = loadOriginalsFromSeed()
  return map.get(playerName) ?? null
}

// ---------------------------------------------------------------------------
// Admin: shifts
// ---------------------------------------------------------------------------

export type AdminPlayerRow = {
  player_id: number
  display_name: string
  invite_code: string
  shift?: {
    team_id: number
    team_name: string
    old_position: number
    new_position: number
    applied_at: string
  } | null
}

export async function getAdminPlayerList(): Promise<AdminPlayerRow[]> {
  const season = await getCurrentSeason()
  const [players, shifts, teamsById] = await Promise.all([
    getAllPlayers(),
    supabaseServer
      .from('shifts')
      .select('player_id, team_id, old_position, new_position, applied_at')
      .eq('season_id', season.id)
      .then(({ data }) => data ?? []),
    getTeamsById(),
  ])
  const shiftByPlayerId = new Map(shifts.map((s) => [s.player_id, s]))
  return players
    .map((p) => {
      const shift = shiftByPlayerId.get(p.id)
      return {
        player_id: p.id,
        display_name: p.display_name,
        invite_code: p.invite_code,
        shift: shift
          ? {
              team_id: shift.team_id,
              team_name: teamsById.get(shift.team_id) ?? '?',
              old_position: shift.old_position,
              new_position: shift.new_position,
              applied_at: shift.applied_at,
            }
          : null,
      }
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
}

export type AdminPlayerDetail = {
  player_id: number
  display_name: string
  invite_code: string
  predictions: { position: number; team_id: number; team_name: string; is_joker: boolean }[]
  shift: AdminPlayerRow['shift']
}

export async function getAdminPlayerDetail(inviteCode: string): Promise<AdminPlayerDetail | null> {
  const season = await getCurrentSeason()
  const players = await getAllPlayers()
  const player = players.find((p) => p.invite_code.toUpperCase() === inviteCode.toUpperCase())
  if (!player) return null
  const teamsById = await getTeamsById()
  const { data: predRows } = await supabaseServer
    .from('predictions')
    .select('position, team_id, is_joker')
    .eq('player_id', player.id)
    .eq('season_id', season.id)
    .order('position')
  const { data: shiftRow } = await supabaseServer
    .from('shifts')
    .select('team_id, old_position, new_position, applied_at')
    .eq('player_id', player.id)
    .eq('season_id', season.id)
    .maybeSingle()
  return {
    player_id: player.id,
    display_name: player.display_name,
    invite_code: player.invite_code,
    predictions: (predRows ?? []).map((p) => ({
      position: p.position,
      team_id: p.team_id,
      team_name: teamsById.get(p.team_id) ?? '?',
      is_joker: p.is_joker,
    })),
    shift: shiftRow
      ? {
          team_id: shiftRow.team_id,
          team_name: teamsById.get(shiftRow.team_id) ?? '?',
          old_position: shiftRow.old_position,
          new_position: shiftRow.new_position,
          applied_at: shiftRow.applied_at,
        }
      : null,
  }
}

/**
 * Compute the new position list when applying an "insert and cascade" shift.
 * Returns a map of team_id → new position.
 */
export function computeShiftedPositions(
  predictions: { position: number; team_id: number }[],
  teamId: number,
  newPosition: number
): Map<number, number> {
  const cur = predictions.find((p) => p.team_id === teamId)
  if (!cur) throw new Error('Team not found in predictions')
  const oldPosition = cur.position
  const result = new Map<number, number>()
  for (const p of predictions) {
    if (p.team_id === teamId) {
      result.set(p.team_id, newPosition)
    } else if (newPosition < oldPosition && p.position >= newPosition && p.position < oldPosition) {
      // Moving up: teams between newPosition..oldPosition-1 shift down by 1
      result.set(p.team_id, p.position + 1)
    } else if (newPosition > oldPosition && p.position > oldPosition && p.position <= newPosition) {
      // Moving down: teams between oldPosition+1..newPosition shift up by 1
      result.set(p.team_id, p.position - 1)
    } else {
      result.set(p.team_id, p.position)
    }
  }
  return result
}

export async function applyShift(args: {
  inviteCode: string
  teamId: number
  newPosition: number
  appliedBy?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const season = await getCurrentSeason()
  const players = await getAllPlayers()
  const player = players.find((p) => p.invite_code.toUpperCase() === args.inviteCode.toUpperCase())
  if (!player) return { ok: false, error: 'Player not found' }

  // Check for existing shift
  const { data: existing } = await supabaseServer
    .from('shifts')
    .select('id')
    .eq('player_id', player.id)
    .eq('season_id', season.id)
    .maybeSingle()
  if (existing) return { ok: false, error: 'Player already has a shift; revert it first' }

  // Get current predictions
  const { data: preds, error: predErr } = await supabaseServer
    .from('predictions')
    .select('position, team_id, is_joker')
    .eq('player_id', player.id)
    .eq('season_id', season.id)
  if (predErr) return { ok: false, error: predErr.message }
  if (!preds || preds.length === 0) return { ok: false, error: 'Player has no predictions' }

  const target = preds.find((p) => p.team_id === args.teamId)
  if (!target) return { ok: false, error: 'Team not in this player\'s predictions' }
  if (target.position === args.newPosition) {
    return { ok: false, error: 'New position is the same as current position' }
  }
  if (args.newPosition < 1 || args.newPosition > 20) {
    return { ok: false, error: 'Position must be 1–20' }
  }

  const oldPosition = target.position
  const newPositions = computeShiftedPositions(preds, args.teamId, args.newPosition)

  // Use a temporary high offset to avoid unique constraint conflicts, then
  // settle into the new positions.
  const OFFSET = 100
  const phase1 = preds.map((p) => ({
    player_id: player.id,
    season_id: season.id,
    team_id: p.team_id,
    position: (newPositions.get(p.team_id) ?? p.position) + OFFSET,
    is_joker: p.is_joker,
  }))

  // Wipe and re-insert with offset positions
  const { error: delErr } = await supabaseServer
    .from('predictions')
    .delete()
    .eq('player_id', player.id)
    .eq('season_id', season.id)
  if (delErr) return { ok: false, error: delErr.message }
  const { error: ins1 } = await supabaseServer.from('predictions').insert(phase1)
  if (ins1) return { ok: false, error: ins1.message }

  // Update offset positions back to actual positions
  for (const row of phase1) {
    await supabaseServer
      .from('predictions')
      .update({ position: row.position - OFFSET })
      .eq('player_id', player.id)
      .eq('season_id', season.id)
      .eq('team_id', row.team_id)
  }

  // Insert shift record
  const { error: shiftErr } = await supabaseServer.from('shifts').insert({
    player_id: player.id,
    season_id: season.id,
    team_id: args.teamId,
    old_position: oldPosition,
    new_position: args.newPosition,
    applied_by: args.appliedBy ?? 'admin',
  })
  if (shiftErr) return { ok: false, error: shiftErr.message }

  return { ok: true }
}

export async function revertShift(inviteCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const season = await getCurrentSeason()
  const players = await getAllPlayers()
  const player = players.find((p) => p.invite_code.toUpperCase() === inviteCode.toUpperCase())
  if (!player) return { ok: false, error: 'Player not found' }

  const { data: shiftRow } = await supabaseServer
    .from('shifts')
    .select('id, team_id, old_position, new_position')
    .eq('player_id', player.id)
    .eq('season_id', season.id)
    .maybeSingle()
  if (!shiftRow) return { ok: false, error: 'No shift to revert' }

  const { data: preds } = await supabaseServer
    .from('predictions')
    .select('position, team_id, is_joker')
    .eq('player_id', player.id)
    .eq('season_id', season.id)
  if (!preds) return { ok: false, error: 'No predictions found' }

  // Reverse the shift: move team back to old_position
  const newPositions = computeShiftedPositions(preds, shiftRow.team_id, shiftRow.old_position)

  const OFFSET = 100
  const phase1 = preds.map((p) => ({
    player_id: player.id,
    season_id: season.id,
    team_id: p.team_id,
    position: (newPositions.get(p.team_id) ?? p.position) + OFFSET,
    is_joker: p.is_joker,
  }))

  await supabaseServer
    .from('predictions')
    .delete()
    .eq('player_id', player.id)
    .eq('season_id', season.id)
  await supabaseServer.from('predictions').insert(phase1)
  for (const row of phase1) {
    await supabaseServer
      .from('predictions')
      .update({ position: row.position - OFFSET })
      .eq('player_id', player.id)
      .eq('season_id', season.id)
      .eq('team_id', row.team_id)
  }

  await supabaseServer.from('shifts').delete().eq('id', shiftRow.id)
  return { ok: true }
}

export async function updatePlayerPredictions(
  inviteCode: string,
  predictions: { team_id: number; position: number; is_joker: boolean }[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (predictions.length !== 20) {
    return { ok: false, error: 'Must include exactly 20 teams.' }
  }
  const positions = [...predictions].map((p) => p.position).sort((a, b) => a - b)
  for (let i = 0; i < 20; i++) {
    if (positions[i] !== i + 1) {
      return { ok: false, error: 'Positions must use every number 1–20 exactly once.' }
    }
  }
  const jokerCount = predictions.filter((p) => p.is_joker).length
  if (jokerCount !== 1) {
    return { ok: false, error: 'Exactly one team must be marked as the Joker.' }
  }

  const teamIds = new Set(predictions.map((p) => p.team_id))
  if (teamIds.size !== 20) {
    return { ok: false, error: 'Each team must be unique.' }
  }

  const season = await getCurrentSeason()
  const players = await getAllPlayers()
  const player = players.find(
    (p) => p.invite_code.toUpperCase() === inviteCode.toUpperCase()
  )
  if (!player) return { ok: false, error: 'Player not found.' }

  // Wipe and re-insert (avoids unique-constraint conflicts during update)
  const { error: delErr } = await supabaseServer
    .from('predictions')
    .delete()
    .eq('player_id', player.id)
    .eq('season_id', season.id)
  if (delErr) return { ok: false, error: delErr.message }

  const rows = predictions.map((p) => ({
    player_id: player.id,
    season_id: season.id,
    team_id: p.team_id,
    position: p.position,
    is_joker: p.is_joker,
  }))
  const { error: insErr } = await supabaseServer.from('predictions').insert(rows)
  if (insErr) return { ok: false, error: insErr.message }

  // Editing the prediction invalidates any prior shift, since the shift
  // logic was expressed against the old positions. Drop the shift row to
  // keep the model honest.
  await supabaseServer
    .from('shifts')
    .delete()
    .eq('player_id', player.id)
    .eq('season_id', season.id)

  return { ok: true }
}

/**
 * Recalculate live scores for every player and write a fresh snapshot.
 * Called after applying or reverting a shift.
 */
export async function recalculateAllScores(triggerEvent: string = 'shift_change') {
  const season = await getCurrentSeason()
  const [standings, predictions, players] = await Promise.all([
    getActualStandingsBySeason(season.id),
    getAllPredictions(season.id),
    getAllPlayers(),
  ])
  const actualByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))
  const now = new Date().toISOString()

  const rows = players.map((player) => {
    const myPreds = predictions.filter((p) => p.player_id === player.id)
    let total = 0
    for (const p of myPreds) {
      const actual = actualByTeamId.get(p.team_id)
      if (actual == null) continue
      const distance = Math.abs(p.position - actual)
      const base = distance === 0 ? 5 : distance === 1 ? 3 : distance === 2 ? 1 : 0
      total += base * (p.is_joker ? 2 : 1)
    }
    return {
      player_id: player.id,
      season_id: season.id,
      live_score: total,
      cumulative_score: total,
      trigger_event: triggerEvent,
      snapshot_at: now,
    }
  })

  await supabaseServer.from('score_snapshots').insert(rows)
}

// ---------------------------------------------------------------------------
// Per-player movement (powered by snapshot history)
// ---------------------------------------------------------------------------

export type PreviousFixture = {
  fixture_name: string
  starting_at: string
  result_info: string | null
  actual_winner: 'home' | 'away' | 'draw' | 'unknown'
  home_team_name: string | null
  home_predicted_position: number | null
  home_actual_position: number | null
  home_is_joker: boolean
  away_team_name: string | null
  away_predicted_position: number | null
  away_actual_position: number | null
  away_is_joker: boolean
  needed_outcome: 'home' | 'away' | 'draw'
  needed_outcome_label: string
  outcome_correct: boolean | null
  delta_home_win: number
  delta_draw: number
  delta_away_win: number
  delta_actual: number
  joker_in_match: boolean
}

export type PlayerMovement = {
  has_data: boolean
  score_change: number
  score_before: number | null
  score_after: number
  rank_change: number
  rank_before: number | null
  rank_after: number
  hours_between: number
  joker_team_name: string | null
  joker_change: number
  previous_fixtures: PreviousFixture[]
  success_rate: number | null
  success_count: number
  evaluable_count: number
  total_actual_delta: number
  narrative: string[]
}

export async function getPlayerMovement(inviteCode: string): Promise<PlayerMovement> {
  const empty: PlayerMovement = {
    has_data: false,
    score_change: 0,
    score_before: null,
    score_after: 0,
    rank_change: 0,
    rank_before: null,
    rank_after: 0,
    hours_between: 0,
    joker_team_name: null,
    joker_change: 0,
    previous_fixtures: [],
    success_rate: null,
    success_count: 0,
    evaluable_count: 0,
    total_actual_delta: 0,
    narrative: [],
  }

  const season = await getCurrentSeason()
  const batches = await getRecentSnapshotBatches()
  const players = await getAllPlayers()
  const player = players.find((p) => p.invite_code.toUpperCase() === inviteCode.toUpperCase())
  if (!player || !batches) return empty

  // Build rank maps
  const rankBatch = (batch: typeof batches.current) =>
    new Map(
      [...batch].sort((a, b) => b.live_score - a.live_score).map((s, i) => [s.player_id, i + 1])
    )
  const currentRanks = rankBatch(batches.current)
  const currentRank = currentRanks.get(player.id) ?? 0

  const cur = batches.current.find((s) => s.player_id === player.id)
  if (!cur) return empty

  // Joker identification
  const teamsById = await getTeamsById()
  const predictions = await getAllPredictions(season.id)
  const myPreds = predictions.filter((p) => p.player_id === player.id)
  const jokerPred = myPreds.find((p) => p.is_joker)
  const jokerTeamName = jokerPred ? teamsById.get(jokerPred.team_id) ?? null : null

  if (!batches.previous || !batches.previousTime) {
    return {
      ...empty,
      has_data: false,
      score_after: cur.live_score,
      rank_after: currentRank,
      joker_team_name: jokerTeamName,
    }
  }

  const previousRanks = rankBatch(batches.previous)
  const prev = batches.previous.find((s) => s.player_id === player.id)
  const rankBefore = previousRanks.get(player.id) ?? null

  const scoreChange = prev ? cur.live_score - prev.live_score : 0
  const rankChange = rankBefore != null ? rankBefore - currentRank : 0
  const hoursBetween =
    (new Date(batches.currentTime).getTime() - new Date(batches.previousTime).getTime()) /
    (1000 * 60 * 60)

  // Fixtures in window — annotate with this player's relevant team
  const { data: fixtures } = await supabaseServer
    .from('fixtures')
    .select('fixture_name, starting_at, result_info, home_team_id, away_team_id')
    .eq('season_id', season.id)
    .eq('state_id', 5)
    .gte('starting_at', batches.previousTime)
    .lte('starting_at', batches.currentTime)
    .order('starting_at', { ascending: false })

  const standings = await getActualStandingsBySeason(season.id)
  const actualByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))
  const myPredByTeamId = new Map(myPreds.map((p) => [p.team_id, p]))

  // Build per-fixture needed-vs-actual analysis
  const previousFixtures: PreviousFixture[] = []
  let successCount = 0
  let evaluableCount = 0
  let totalActualDelta = 0

  for (const f of fixtures ?? []) {
    if (f.home_team_id == null || f.away_team_id == null) continue
    const homePred = myPredByTeamId.get(f.home_team_id)
    const awayPred = myPredByTeamId.get(f.away_team_id)
    const homeName = teamsById.get(f.home_team_id) ?? null
    const awayName = teamsById.get(f.away_team_id) ?? null
    const homeActual = actualByTeamId.get(f.home_team_id) ?? null
    const awayActual = actualByTeamId.get(f.away_team_id) ?? null

    // Project per-outcome score deltas using the simplified ±1 model
    const homeUp = homeActual != null ? Math.max(1, homeActual - 1) : null
    const homeDown = homeActual != null ? Math.min(20, homeActual + 1) : null
    const awayUp = awayActual != null ? Math.max(1, awayActual - 1) : null
    const awayDown = awayActual != null ? Math.min(20, awayActual + 1) : null

    const dHomeWin =
      pointsForChange(homePred?.position ?? null, homeActual, homeUp, !!homePred?.is_joker) +
      pointsForChange(awayPred?.position ?? null, awayActual, awayDown, !!awayPred?.is_joker)
    const dAwayWin =
      pointsForChange(homePred?.position ?? null, homeActual, homeDown, !!homePred?.is_joker) +
      pointsForChange(awayPred?.position ?? null, awayActual, awayUp, !!awayPred?.is_joker)
    const dDraw = 0

    let needed: 'home' | 'away' | 'draw' = 'draw'
    let neededDelta = dDraw
    if (dHomeWin > neededDelta) {
      needed = 'home'
      neededDelta = dHomeWin
    }
    if (dAwayWin > neededDelta) {
      needed = 'away'
      neededDelta = dAwayWin
    }
    const neededLabel =
      needed === 'home'
        ? `${homeName ?? 'Home'} win`
        : needed === 'away'
        ? `${awayName ?? 'Away'} win`
        : 'Draw'

    const actualWinner = inferFixtureWinner(homeName, awayName, f.result_info)
    let dActual = 0
    if (actualWinner === 'home') dActual = dHomeWin
    else if (actualWinner === 'away') dActual = dAwayWin
    else if (actualWinner === 'draw') dActual = dDraw

    let outcomeCorrect: boolean | null = null
    if (actualWinner !== 'unknown') {
      outcomeCorrect = actualWinner === needed
      evaluableCount++
      if (outcomeCorrect) successCount++
      totalActualDelta += dActual
    }

    previousFixtures.push({
      fixture_name: f.fixture_name ?? 'Premier League fixture',
      starting_at: f.starting_at,
      result_info: f.result_info,
      actual_winner: actualWinner,
      home_team_name: homeName,
      home_predicted_position: homePred?.position ?? null,
      home_actual_position: homeActual,
      home_is_joker: !!homePred?.is_joker,
      away_team_name: awayName,
      away_predicted_position: awayPred?.position ?? null,
      away_actual_position: awayActual,
      away_is_joker: !!awayPred?.is_joker,
      needed_outcome: needed,
      needed_outcome_label: neededLabel,
      outcome_correct: outcomeCorrect,
      delta_home_win: dHomeWin,
      delta_draw: dDraw,
      delta_away_win: dAwayWin,
      delta_actual: dActual,
      joker_in_match: !!homePred?.is_joker || !!awayPred?.is_joker,
    })
  }

  // Sort: Joker matches first, then by delta_actual magnitude
  previousFixtures.sort((a, b) => {
    if (a.joker_in_match !== b.joker_in_match) return a.joker_in_match ? -1 : 1
    return Math.abs(b.delta_actual) - Math.abs(a.delta_actual)
  })

  const successRate = evaluableCount > 0 ? successCount / evaluableCount : null

  // Narrative segments
  const narrative: string[] = []
  if (scoreChange > 0) {
    const rankClause =
      rankChange > 0
        ? `, advancing ${rankChange} ${rankChange === 1 ? 'position' : 'positions'} to ${ordinal(currentRank)}`
        : ''
    narrative.push(
      `Your score increased by ${scoreChange} ${scoreChange === 1 ? 'point' : 'points'} this period${rankClause}.`
    )
  } else if (scoreChange < 0) {
    const rankClause =
      rankChange < 0
        ? `, dropping ${Math.abs(rankChange)} ${Math.abs(rankChange) === 1 ? 'position' : 'positions'} to ${ordinal(currentRank)}`
        : ''
    narrative.push(
      `Your score declined by ${Math.abs(scoreChange)} ${Math.abs(scoreChange) === 1 ? 'point' : 'points'} this period${rankClause}.`
    )
  } else {
    narrative.push(
      `Your score is unchanged this period; current rank ${ordinal(currentRank)}.`
    )
  }

  if (jokerTeamName && jokerPred) {
    const actualPos = actualByTeamId.get(jokerPred.team_id) ?? null
    if (actualPos != null) {
      const distance = Math.abs(jokerPred.position - actualPos)
      const directionalNote =
        distance === 0
          ? `currently at exact-position match (5 base, doubled to 10).`
          : distance === 1
          ? `currently within ±1 of your prediction (3 base, doubled to 6).`
          : distance === 2
          ? `currently within ±2 of your prediction (1 base, doubled to 2).`
          : `currently more than 2 positions from your prediction (no Joker yield).`
      narrative.push(`Joker review: ${jokerTeamName} is ${directionalNote}`)
    }
  }

  if (successRate !== null && evaluableCount >= 2) {
    const pct = Math.round(successRate * 100)
    narrative.push(
      `Result-needed accuracy: ${successCount} of ${evaluableCount} fixtures (${pct}%) returned the outcome that would have improved your score.`
    )
  }

  return {
    has_data: true,
    score_change: scoreChange,
    score_before: prev?.live_score ?? null,
    score_after: cur.live_score,
    rank_change: rankChange,
    rank_before: rankBefore,
    rank_after: currentRank,
    hours_between: Math.round(hoursBetween * 10) / 10,
    joker_team_name: jokerTeamName,
    joker_change: 0,
    previous_fixtures: previousFixtures,
    success_rate: successRate,
    success_count: successCount,
    evaluable_count: evaluableCount,
    total_actual_delta: totalActualDelta,
    narrative,
  }
}

// Helper: change in points if a team's actual position moves
function pointsForChange(
  predictedPos: number | null,
  oldActualPos: number | null,
  newActualPos: number | null,
  isJoker: boolean
): number {
  if (predictedPos == null || oldActualPos == null || newActualPos == null) return 0
  const ptsAt = (actual: number) => {
    const distance = Math.abs(predictedPos - actual)
    const base = distance === 0 ? 5 : distance === 1 ? 3 : distance === 2 ? 1 : 0
    return base * (isJoker ? 2 : 1)
  }
  return ptsAt(newActualPos) - ptsAt(oldActualPos)
}

// ---------------------------------------------------------------------------
// Scenario builder data
// ---------------------------------------------------------------------------

import type {
  ScenarioFixture,
  ScenarioStanding,
  ScenarioPlayer,
} from './scenario'

export type ScenarioData = {
  player_id: number
  display_name: string
  invite_code: string
  fixtures: ScenarioFixture[]
  current_standings: ScenarioStanding[]
  all_players: ScenarioPlayer[]
}

export async function getScenarioData(inviteCode: string): Promise<ScenarioData | null> {
  const season = await getCurrentSeason()
  const players = await getAllPlayers()
  const player = players.find(
    (p) => p.invite_code.toUpperCase() === inviteCode.toUpperCase()
  )
  if (!player) return null

  const teamsById = await getTeamsById()
  const standings = await getActualStandingsBySeason(season.id)
  const predictions = await getAllPredictions(season.id)

  const { data: fixtureRows } = await supabaseServer
    .from('fixtures')
    .select('id, starting_at, home_team_id, away_team_id, state_id')
    .eq('season_id', season.id)
    .eq('state_id', 1)
    .order('starting_at', { ascending: true })

  const fixtures: ScenarioFixture[] = (fixtureRows ?? [])
    .filter((f) => f.home_team_id != null && f.away_team_id != null)
    .map((f) => ({
      fixture_id: f.id,
      starting_at: f.starting_at,
      home_team_id: f.home_team_id as number,
      home_team_name: teamsById.get(f.home_team_id as number) ?? '?',
      away_team_id: f.away_team_id as number,
      away_team_name: teamsById.get(f.away_team_id as number) ?? '?',
    }))

  const currentStandings: ScenarioStanding[] = standings.map((s) => ({
    team_id: s.team_id,
    team_name: teamsById.get(s.team_id) ?? '?',
    position: s.position,
    points: s.points,
    goal_difference: 0, // not in our restricted Sportmonks plan; treat as 0 baseline
  }))

  const allPlayers: ScenarioPlayer[] = players.map((p) => {
    const myPreds = predictions.filter((pr) => pr.player_id === p.id)
    const joker = myPreds.find((pr) => pr.is_joker)
    return {
      player_id: p.id,
      display_name: p.display_name,
      invite_code: p.invite_code,
      joker_team_id: joker?.team_id ?? null,
      predictions: myPreds.map((pr) => ({
        position: pr.position,
        team_id: pr.team_id,
        is_joker: pr.is_joker,
      })),
    }
  })

  return {
    player_id: player.id,
    display_name: player.display_name,
    invite_code: player.invite_code,
    fixtures,
    current_standings: currentStandings,
    all_players: allPlayers,
  }
}

// ---------------------------------------------------------------------------
// Player fixture look-ahead
// ---------------------------------------------------------------------------

export type FixtureSide = {
  team_name: string
  actual_position: number | null
  predicted_position: number | null
  current_points: number
  is_joker: boolean
}

export type FixtureLookAhead = {
  fixture_id: number
  starting_at: string
  fixture_name: string
  home: FixtureSide
  away: FixtureSide
  delta_home_win: number
  delta_draw: number
  delta_away_win: number
  best_outcome: 'home_win' | 'draw' | 'away_win'
  best_delta: number
  has_stake: boolean
  live_home_score: number | null
  live_away_score: number | null
  live_period: string | null
  state_id: number | null
}

function pointsFor(predictedPos: number, actualPos: number, isJoker: boolean) {
  const distance = Math.abs(predictedPos - actualPos)
  const base = distance === 0 ? 5 : distance === 1 ? 3 : distance === 2 ? 1 : 0
  return base * (isJoker ? 2 : 1)
}

function deltaForMove(
  predictedPos: number | null,
  oldActualPos: number | null,
  newActualPos: number | null,
  isJoker: boolean
) {
  if (predictedPos == null || oldActualPos == null || newActualPos == null) return 0
  return pointsFor(predictedPos, newActualPos, isJoker) - pointsFor(predictedPos, oldActualPos, isJoker)
}

export async function getPlayerUpcomingFixtures(
  inviteCode: string,
  daysAhead = 30
): Promise<{ fixtures: FixtureLookAhead[]; player_name: string } | null> {
  const season = await getCurrentSeason()
  const [standings, teamsById, predictions, players] = await Promise.all([
    getActualStandingsBySeason(season.id),
    getTeamsById(),
    getAllPredictions(season.id),
    getAllPlayers(),
  ])
  const player = players.find((p) => p.invite_code.toUpperCase() === inviteCode.toUpperCase())
  if (!player) return null

  const myPreds = predictions.filter((p) => p.player_id === player.id)
  const predByTeamId = new Map(myPreds.map((p) => [p.team_id, p]))
  const actualByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))

  // Pull upcoming fixtures from our local DB
  const now = new Date()
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
  const { data: rows, error } = await supabaseServer
    .from('fixtures')
    .select(
      'id, sportmonks_id, starting_at, fixture_name, home_team_id, away_team_id, state_id, live_home_score, live_away_score, live_period'
    )
    .eq('season_id', season.id)
    .gte('starting_at', now.toISOString())
    .lte('starting_at', cutoff.toISOString())
    .order('starting_at', { ascending: true })
  if (error) throw error

  const result: FixtureLookAhead[] = []
  for (const f of rows ?? []) {
    const homeName = teamsById.get(f.home_team_id) ?? 'Unknown'
    const awayName = teamsById.get(f.away_team_id) ?? 'Unknown'

    const homeActual = f.home_team_id != null ? actualByTeamId.get(f.home_team_id) ?? null : null
    const awayActual = f.away_team_id != null ? actualByTeamId.get(f.away_team_id) ?? null : null
    const homePred = f.home_team_id != null ? predByTeamId.get(f.home_team_id) ?? null : null
    const awayPred = f.away_team_id != null ? predByTeamId.get(f.away_team_id) ?? null : null

    const homeIsJoker = !!homePred?.is_joker
    const awayIsJoker = !!awayPred?.is_joker

    const homeCurrent =
      homePred && homeActual != null
        ? pointsFor(homePred.position, homeActual, homeIsJoker)
        : 0
    const awayCurrent =
      awayPred && awayActual != null
        ? pointsFor(awayPred.position, awayActual, awayIsJoker)
        : 0

    // Simplified projection: a win moves the team up 1, a loss moves them down 1.
    const homeUp = homeActual != null ? Math.max(1, homeActual - 1) : null
    const homeDown = homeActual != null ? Math.min(20, homeActual + 1) : null
    const awayUp = awayActual != null ? Math.max(1, awayActual - 1) : null
    const awayDown = awayActual != null ? Math.min(20, awayActual + 1) : null

    const deltaHomeWin =
      deltaForMove(homePred?.position ?? null, homeActual, homeUp, homeIsJoker) +
      deltaForMove(awayPred?.position ?? null, awayActual, awayDown, awayIsJoker)
    const deltaAwayWin =
      deltaForMove(homePred?.position ?? null, homeActual, homeDown, homeIsJoker) +
      deltaForMove(awayPred?.position ?? null, awayActual, awayUp, awayIsJoker)
    const deltaDraw = 0

    let best: 'home_win' | 'draw' | 'away_win' = 'draw'
    let bestDelta = deltaDraw
    if (deltaHomeWin > bestDelta) {
      best = 'home_win'
      bestDelta = deltaHomeWin
    }
    if (deltaAwayWin > bestDelta) {
      best = 'away_win'
      bestDelta = deltaAwayWin
    }

    result.push({
      fixture_id: f.id,
      starting_at: f.starting_at,
      fixture_name: f.fixture_name ?? `${homeName} vs ${awayName}`,
      home: {
        team_name: homeName,
        actual_position: homeActual,
        predicted_position: homePred?.position ?? null,
        current_points: homeCurrent,
        is_joker: homeIsJoker,
      },
      away: {
        team_name: awayName,
        actual_position: awayActual,
        predicted_position: awayPred?.position ?? null,
        current_points: awayCurrent,
        is_joker: awayIsJoker,
      },
      delta_home_win: deltaHomeWin,
      delta_draw: deltaDraw,
      delta_away_win: deltaAwayWin,
      best_outcome: best,
      best_delta: bestDelta,
      has_stake: bestDelta > 0 || homeIsJoker || awayIsJoker || homeCurrent >= 5 || awayCurrent >= 5,
      live_home_score: f.live_home_score,
      live_away_score: f.live_away_score,
      live_period: f.live_period,
      state_id: f.state_id,
    })
  }

  return { fixtures: result, player_name: player.display_name }
}

// ---------------------------------------------------------------------------
// Compare two players
// ---------------------------------------------------------------------------

export type ComparisonRow = {
  position: number
  a: { team_name: string; actual_position: number | null; distance: number | null; points: number; is_joker: boolean } | null
  b: { team_name: string; actual_position: number | null; distance: number | null; points: number; is_joker: boolean } | null
  same: boolean
}

export type Comparison = {
  a: { player: Player; rank: number; total: number; joker_team: string | null }
  b: { player: Player; rank: number; total: number; joker_team: string | null }
  rows: ComparisonRow[]
  agreement_count: number // positions where both predicted the same team
  agreement_positions: number[]
}

export async function getComparison(codeA: string, codeB: string): Promise<Comparison | null> {
  const [a, b] = await Promise.all([getPlayerDetail(codeA), getPlayerDetail(codeB)])
  if (!a || !b) return null
  if (a.player.id === b.player.id) return null

  const byPos = (scored: ScoredPrediction[]) => {
    const m = new Map<number, ScoredPrediction>()
    for (const s of scored) m.set(s.position, s)
    return m
  }
  const aPos = byPos(a.scored)
  const bPos = byPos(b.scored)

  const rows: ComparisonRow[] = []
  let agreement = 0
  const agreementPositions: number[] = []
  for (let pos = 1; pos <= 20; pos++) {
    const ap = aPos.get(pos)
    const bp = bPos.get(pos)
    const same = !!(ap && bp && ap.team_id === bp.team_id)
    if (same) {
      agreement++
      agreementPositions.push(pos)
    }
    rows.push({
      position: pos,
      a: ap
        ? {
            team_name: ap.team_name,
            actual_position: ap.actual_position,
            distance: ap.distance,
            points: ap.points,
            is_joker: ap.is_joker,
          }
        : null,
      b: bp
        ? {
            team_name: bp.team_name,
            actual_position: bp.actual_position,
            distance: bp.distance,
            points: bp.points,
            is_joker: bp.is_joker,
          }
        : null,
      same,
    })
  }

  return {
    a: { player: a.player, rank: a.rank, total: a.total, joker_team: a.joker_team_name },
    b: { player: b.player, rank: b.rank, total: b.total, joker_team: b.joker_team_name },
    rows,
    agreement_count: agreement,
    agreement_positions: agreementPositions,
  }
}

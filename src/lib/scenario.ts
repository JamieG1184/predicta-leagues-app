// Pure scenario projection logic — safe for client components.
// Given current standings and a set of "what if" fixture outcomes,
// projects what the final PL table would look like and computes each
// player's projected final score.

export type FixtureOutcome = 'skip' | 'home' | 'draw' | 'away'

export type ScenarioFixture = {
  fixture_id: number
  starting_at: string
  home_team_id: number
  home_team_name: string
  away_team_id: number
  away_team_name: string
}

export type ScenarioStanding = {
  team_id: number
  team_name: string
  position: number
  points: number
  goal_difference: number
}

export type ScenarioPlayer = {
  player_id: number
  display_name: string
  invite_code: string
  joker_team_id: number | null
  predictions: { position: number; team_id: number; is_joker: boolean }[]
}

export function projectStandings(
  current: ScenarioStanding[],
  scenarios: Map<number, FixtureOutcome>,
  fixtures: ScenarioFixture[]
): ScenarioStanding[] {
  const projectedPts = new Map(current.map((s) => [s.team_id, s.points]))
  const projectedGd = new Map(current.map((s) => [s.team_id, s.goal_difference]))

  for (const f of fixtures) {
    const outcome = scenarios.get(f.fixture_id) ?? 'skip'
    if (outcome === 'home') {
      projectedPts.set(f.home_team_id, (projectedPts.get(f.home_team_id) ?? 0) + 3)
      projectedGd.set(f.home_team_id, (projectedGd.get(f.home_team_id) ?? 0) + 1)
      projectedGd.set(f.away_team_id, (projectedGd.get(f.away_team_id) ?? 0) - 1)
    } else if (outcome === 'away') {
      projectedPts.set(f.away_team_id, (projectedPts.get(f.away_team_id) ?? 0) + 3)
      projectedGd.set(f.away_team_id, (projectedGd.get(f.away_team_id) ?? 0) + 1)
      projectedGd.set(f.home_team_id, (projectedGd.get(f.home_team_id) ?? 0) - 1)
    } else if (outcome === 'draw') {
      projectedPts.set(f.home_team_id, (projectedPts.get(f.home_team_id) ?? 0) + 1)
      projectedPts.set(f.away_team_id, (projectedPts.get(f.away_team_id) ?? 0) + 1)
    }
  }

  return current
    .map((s) => ({
      team_id: s.team_id,
      team_name: s.team_name,
      points: projectedPts.get(s.team_id) ?? s.points,
      goal_difference: projectedGd.get(s.team_id) ?? s.goal_difference,
      position: 0,
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goal_difference - a.goal_difference ||
        a.team_name.localeCompare(b.team_name)
    )
    .map((s, i) => ({ ...s, position: i + 1 }))
}

export function scoreAgainstStandings(
  predictions: { position: number; team_id: number; is_joker: boolean }[],
  standings: ScenarioStanding[]
): number {
  const posByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))
  let total = 0
  for (const p of predictions) {
    const actual = posByTeamId.get(p.team_id)
    if (actual == null) continue
    const distance = Math.abs(p.position - actual)
    const base = distance === 0 ? 5 : distance === 1 ? 3 : distance === 2 ? 1 : 0
    total += base * (p.is_joker ? 2 : 1)
  }
  return total
}

export type LeaderboardProjection = {
  player_id: number
  display_name: string
  invite_code: string
  current_score: number
  projected_score: number
  delta: number
  current_rank: number
  projected_rank: number
  rank_change: number
}

export function projectLeaderboard(
  players: ScenarioPlayer[],
  currentStandings: ScenarioStanding[],
  projectedStandings: ScenarioStanding[]
): LeaderboardProjection[] {
  const rows = players.map((p) => {
    const cur = scoreAgainstStandings(p.predictions, currentStandings)
    const proj = scoreAgainstStandings(p.predictions, projectedStandings)
    return {
      player_id: p.player_id,
      display_name: p.display_name,
      invite_code: p.invite_code,
      current_score: cur,
      projected_score: proj,
      delta: proj - cur,
      current_rank: 0,
      projected_rank: 0,
      rank_change: 0,
    }
  })
  // Compute current ranks
  const byCurrent = [...rows].sort((a, b) => b.current_score - a.current_score)
  byCurrent.forEach((r, i) => (r.current_rank = i + 1))
  // Compute projected ranks
  const byProjected = [...rows].sort(
    (a, b) =>
      b.projected_score - a.projected_score ||
      a.display_name.localeCompare(b.display_name)
  )
  byProjected.forEach((r, i) => (r.projected_rank = i + 1))
  for (const r of rows) r.rank_change = r.current_rank - r.projected_rank
  return rows.sort((a, b) => a.projected_rank - b.projected_rank)
}

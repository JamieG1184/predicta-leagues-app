// Predicta Leagues — Scoring engine.
//
// Reads each player's predictions and the live PL table, computes a live
// score using the 5/3/1/0 formula with Joker doubling, saves a snapshot,
// and prints the current leaderboard.
//
// Run with:
//   npm run scores:calculate

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

// ---------------------------------------------------------------------------
// The scoring formula. Pure function — easy to test and reason about.
// ---------------------------------------------------------------------------
export function pointsForDistance(distance) {
  if (distance === 0) return 5
  if (distance === 1) return 3
  if (distance === 2) return 1
  return 0
}

export function scoreForPlayer({ predictions, actualPositionByTeamId, jokerTeamId }) {
  // predictions: [{ position: 1..20, team_id, is_joker }]
  // actualPositionByTeamId: Map<team_id, actual position 1..20>
  let total = 0
  const breakdown = []
  for (const p of predictions) {
    const actualPos = actualPositionByTeamId.get(p.team_id)
    if (actualPos == null) {
      breakdown.push({ ...p, actual_position: null, distance: null, points: 0 })
      continue
    }
    const distance = Math.abs(p.position - actualPos)
    let pts = pointsForDistance(distance)
    if (p.team_id === jokerTeamId) pts *= 2
    total += pts
    breakdown.push({ ...p, actual_position: actualPos, distance, points: pts })
  }
  return { total, breakdown }
}

// ---------------------------------------------------------------------------
// Main: pull data, score everyone, save snapshots, print leaderboard
// ---------------------------------------------------------------------------
async function main() {
  console.log('Predicta Leagues — Scoring engine\n')

  // 1. Find current season
  const { data: season, error: sErr } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .single()
  if (sErr || !season) throw new Error(`No current season found: ${sErr?.message}`)
  console.log(`Season: ${season.name}`)

  // 2. Read the actual standings — build team_id → actual position map
  const { data: standings, error: stErr } = await supabase
    .from('actual_standings')
    .select('team_id, position')
    .eq('season_id', season.id)
  if (stErr) throw stErr
  const actualPositionByTeamId = new Map(standings.map((s) => [s.team_id, s.position]))
  console.log(`Loaded ${actualPositionByTeamId.size} actual standings rows`)

  // 3. Read all players + their predictions
  const { data: players, error: pErr } = await supabase
    .from('players')
    .select('id, display_name, invite_code')
    .order('display_name')
  if (pErr) throw pErr

  const { data: allPredictions, error: prErr } = await supabase
    .from('predictions')
    .select('player_id, position, team_id, is_joker')
    .eq('season_id', season.id)
  if (prErr) throw prErr

  console.log(`Loaded ${players.length} players and ${allPredictions.length} predictions\n`)

  // 4. Compute scores per player
  const results = []
  const snapshotRows = []
  const now = new Date().toISOString()

  for (const player of players) {
    const myPreds = allPredictions.filter((p) => p.player_id === player.id)
    const jokerPred = myPreds.find((p) => p.is_joker)
    const jokerTeamId = jokerPred?.team_id ?? null

    const { total, breakdown } = scoreForPlayer({
      predictions: myPreds,
      actualPositionByTeamId,
      jokerTeamId,
    })

    results.push({ player, total, jokerTeamId, breakdown })
    snapshotRows.push({
      player_id: player.id,
      season_id: season.id,
      live_score: total,
      cumulative_score: total, // single-snapshot — equal for now
      trigger_event: 'manual_recalc',
      snapshot_at: now,
    })
  }

  // 5. Save the snapshots
  const { error: snapErr } = await supabase.from('score_snapshots').insert(snapshotRows)
  if (snapErr) throw snapErr
  console.log(`Saved ${snapshotRows.length} score snapshots\n`)

  // 6. Print the leaderboard
  results.sort((a, b) => b.total - a.total)

  console.log('Live leaderboard:\n')
  console.log(
    'Rk'.padEnd(4),
    'Player'.padEnd(28),
    'Live'.padStart(5),
    'Joker hit?'.padStart(11)
  )
  console.log('-'.repeat(50))

  // Lookup team names for joker hit display
  const { data: allTeams } = await supabase.from('teams').select('id, name')
  const teamNameById = new Map(allTeams.map((t) => [t.id, t.name]))

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const jokerEntry = r.breakdown.find((b) => b.team_id === r.jokerTeamId)
    const jokerNote = jokerEntry
      ? `${teamNameById.get(r.jokerTeamId)?.slice(0, 5) ?? '?'} ${jokerEntry.points}pts`
      : '—'
    console.log(
      String(i + 1).padEnd(4),
      r.player.display_name.slice(0, 28).padEnd(28),
      String(r.total).padStart(5),
      jokerNote.padStart(11)
    )
  }
}

main().catch((err) => {
  console.error('\nScoring failed:', err.message)
  process.exit(1)
})

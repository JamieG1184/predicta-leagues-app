// Predicta Leagues — Weekly badge awards.
//
// Computes six weekly awards by comparing the latest score snapshot to a
// snapshot from ~7 days earlier. Designed to be run every Tuesday morning
// after the previous weekend's PL matches.
//
//   Blaggers Right        — top of the league this week
//   Wanker of the Week    — bottom of the league this week
//   Highest Climber       — most rank positions improved
//   Biggest Drop          — most rank positions lost
//   Highest Weekly Score  — biggest positive score change
//   Lowest Weekly Score   — biggest negative score change
//
// The unique constraint on (season_id, week_ending, badge_type) means
// re-running this command for the same week is idempotent.
//
// Run with:
//   npm run badges:award

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

function lastSundayISO() {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek
  const sunday = new Date(today)
  sunday.setDate(today.getDate() - daysBack)
  sunday.setHours(0, 0, 0, 0)
  return sunday.toISOString().slice(0, 10) // YYYY-MM-DD
}

async function main() {
  console.log('Predicta Leagues — Weekly badge awards\n')

  // 1. Find current season
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .single()
  if (!season) {
    console.error('No current season found. Run db:seed first.')
    process.exit(1)
  }

  // 2. Get the two most recent snapshot batches
  const { data: rows } = await supabase
    .from('score_snapshots')
    .select('player_id, live_score, snapshot_at')
    .eq('season_id', season.id)
    .order('snapshot_at', { ascending: false })
    .limit(120)

  if (!rows || rows.length === 0) {
    console.error('No score snapshots yet. Run scores:calculate first.')
    process.exit(1)
  }

  const byTime = new Map()
  for (const r of rows) {
    if (!byTime.has(r.snapshot_at)) byTime.set(r.snapshot_at, [])
    byTime.get(r.snapshot_at).push(r)
  }
  const sortedTimes = [...byTime.keys()].sort().reverse()
  const currentTime = sortedTimes[0]
  const previousTime = sortedTimes[1]
  if (!previousTime) {
    console.error(
      'Only one snapshot exists. Take a second snapshot ~7 days later before awarding badges.'
    )
    process.exit(1)
  }

  const currentBatch = byTime.get(currentTime)
  const previousBatch = byTime.get(previousTime)

  // 3. Build score and rank tables
  const previousScoreById = new Map(
    previousBatch.map((r) => [r.player_id, r.live_score])
  )
  const rankByScores = (batch) =>
    new Map(
      [...batch].sort((a, b) => b.live_score - a.live_score).map((s, i) => [s.player_id, i + 1])
    )
  const currentRanks = rankByScores(currentBatch)
  const previousRanks = rankByScores(previousBatch)

  // 4. Build per-player movement
  const movements = currentBatch.map((cur) => {
    const prevScore = previousScoreById.get(cur.player_id) ?? cur.live_score
    const currentRank = currentRanks.get(cur.player_id) ?? 0
    const previousRank = previousRanks.get(cur.player_id) ?? currentRank
    return {
      player_id: cur.player_id,
      current_score: cur.live_score,
      previous_score: prevScore,
      score_delta: cur.live_score - prevScore,
      current_rank: currentRank,
      previous_rank: previousRank,
      rank_delta: previousRank - currentRank, // positive = climbed
    }
  })

  // 5. Determine the six recipients
  const sortedByCurrentRank = [...movements].sort((a, b) => a.current_rank - b.current_rank)
  const topOfLeague = sortedByCurrentRank[0]
  const bottomOfLeague = sortedByCurrentRank[sortedByCurrentRank.length - 1]

  const sortedByRankDelta = [...movements].sort((a, b) => b.rank_delta - a.rank_delta)
  const highestClimber = sortedByRankDelta[0]
  const biggestDrop = sortedByRankDelta[sortedByRankDelta.length - 1]

  const sortedByScoreDelta = [...movements].sort((a, b) => b.score_delta - a.score_delta)
  const highestWeeklyScore = sortedByScoreDelta[0]
  const lowestWeeklyScore = sortedByScoreDelta[sortedByScoreDelta.length - 1]

  // 6. Insert into weekly_badges
  const weekEnding = lastSundayISO()
  const weekLabel = new Date(weekEnding).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })

  const awards = [
    {
      badge_type: 'top_of_league',
      player_id: topOfLeague.player_id,
      value: topOfLeague.current_score,
      notes: `Top of the league with ${topOfLeague.current_score} points`,
    },
    {
      badge_type: 'bottom_of_league',
      player_id: bottomOfLeague.player_id,
      value: bottomOfLeague.current_score,
      notes: `Bottom of the league with ${bottomOfLeague.current_score} points`,
    },
    {
      badge_type: 'highest_climber',
      player_id: highestClimber.player_id,
      value: highestClimber.rank_delta,
      notes:
        highestClimber.rank_delta > 0
          ? `Climbed ${highestClimber.rank_delta} place${highestClimber.rank_delta === 1 ? '' : 's'}`
          : `No climbs this week`,
    },
    {
      badge_type: 'biggest_drop',
      player_id: biggestDrop.player_id,
      value: biggestDrop.rank_delta,
      notes:
        biggestDrop.rank_delta < 0
          ? `Dropped ${Math.abs(biggestDrop.rank_delta)} place${Math.abs(biggestDrop.rank_delta) === 1 ? '' : 's'}`
          : `No drops this week`,
    },
    {
      badge_type: 'highest_weekly_score',
      player_id: highestWeeklyScore.player_id,
      value: highestWeeklyScore.score_delta,
      notes: `Gained ${highestWeeklyScore.score_delta} points this week`,
    },
    {
      badge_type: 'lowest_weekly_score',
      player_id: lowestWeeklyScore.player_id,
      value: lowestWeeklyScore.score_delta,
      notes: `Dropped ${Math.abs(lowestWeeklyScore.score_delta)} points this week`,
    },
  ]

  const rowsToInsert = awards.map((a) => ({
    season_id: season.id,
    week_ending: weekEnding,
    week_label: `Week ending ${weekLabel}`,
    badge_type: a.badge_type,
    player_id: a.player_id,
    value: a.value,
    notes: a.notes,
  }))

  // Upsert (re-run-safe via the unique constraint)
  const { error } = await supabase
    .from('weekly_badges')
    .upsert(rowsToInsert, { onConflict: 'season_id,week_ending,badge_type' })
  if (error) throw error

  // 7. Pretty-print results
  const { data: players } = await supabase
    .from('players')
    .select('id, display_name')
  const nameById = new Map((players ?? []).map((p) => [p.id, p.display_name]))

  console.log(`Week ending ${weekLabel} (period: ${previousTime.slice(0, 10)} → ${currentTime.slice(0, 10)})\n`)

  const labels = {
    top_of_league: '🏆 Blaggers Right',
    bottom_of_league: '🤡 Wanker of the Week',
    highest_climber: '📈 Highest Climber',
    biggest_drop: '📉 Biggest Drop',
    highest_weekly_score: '🎯 Highest Weekly Score',
    lowest_weekly_score: '💀 Lowest Weekly Score',
  }
  for (const a of awards) {
    const name = nameById.get(a.player_id) ?? `[id=${a.player_id}]`
    console.log(`  ${labels[a.badge_type].padEnd(28)} ${name.padEnd(28)} ${a.notes}`)
  }
  console.log('\n✓ Badges saved to weekly_badges table.')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

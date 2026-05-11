// Predicta Leagues — Apply Updated Predictions positions.
//
// Single source of truth for team POSITIONS for the rest of the 2025/26
// season is now "2025-26 Updated Predictions.xlsx" (parsed into
// updated-positions.json). Jokers are NOT in that spreadsheet, so we keep
// whatever Joker each player already has in the DB.
//
// What this script does for each player:
//   1. Look up their current Joker team in the DB
//   2. If positions in the DB already match the spreadsheet → skip
//   3. Otherwise, wipe their predictions and re-insert from the
//      spreadsheet, marking is_joker=true on the previously-Joker team
//
// Players in the spreadsheet but NOT in the DB (e.g. Rebecca McCairns,
// intentionally excluded) are skipped. Players in the DB but NOT in the
// spreadsheet (e.g. Duncan Milroy) are left untouched.
//
// Idempotent — safe to re-run. Run with:
//   node --env-file=.env.local scripts/apply-updated-positions.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function main() {
  console.log('Predicta Leagues — Apply Updated Predictions positions\n')

  const players = JSON.parse(
    readFileSync(join(projectRoot, 'updated-positions.json'), 'utf-8')
  )
  console.log(`Loaded ${players.length} players from updated-positions.json`)

  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_current', true)
    .single()
  if (!season) {
    console.error('No current season found.')
    process.exit(1)
  }

  const { data: teams } = await supabase.from('teams').select('id, name')
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]))

  const { data: dbPlayers } = await supabase
    .from('players')
    .select('id, display_name')
  const playerIdByName = new Map(
    dbPlayers.map((p) => [p.display_name, p.id])
  )

  let updated = 0
  let unchanged = 0
  let missing = 0

  for (const p of players) {
    const playerId = playerIdByName.get(p.name)
    if (!playerId) {
      console.log(`  ⚠ ${p.name} — not in DB (skipping)`)
      missing++
      continue
    }

    // Get current predictions so we can preserve the Joker selection.
    const { data: currentPreds } = await supabase
      .from('predictions')
      .select('team_id, position, is_joker')
      .eq('player_id', playerId)
      .eq('season_id', season.id)

    const currentJokerTeamId =
      currentPreds?.find((r) => r.is_joker)?.team_id ?? null

    // Build the desired predictions from the spreadsheet, marking the
    // existing Joker team as is_joker=true.
    const newRows = []
    for (const pred of p.predictions) {
      const teamId = teamIdByName.get(pred.team)
      if (!teamId) {
        console.log(`  ✗ ${p.name}: unknown team "${pred.team}" — skipping`)
        newRows.length = 0
        break
      }
      newRows.push({
        player_id: playerId,
        season_id: season.id,
        position: pred.position,
        team_id: teamId,
        is_joker: teamId === currentJokerTeamId,
      })
    }
    if (newRows.length !== 20) {
      continue
    }

    // Diff check: if every (position, team_id, is_joker) matches, skip.
    let identical = (currentPreds?.length ?? 0) === 20
    if (identical) {
      const currentByPos = new Map(
        currentPreds.map((r) => [r.position, { team_id: r.team_id, is_joker: r.is_joker }])
      )
      for (const nr of newRows) {
        const cur = currentByPos.get(nr.position)
        if (!cur || cur.team_id !== nr.team_id || cur.is_joker !== nr.is_joker) {
          identical = false
          break
        }
      }
    }
    if (identical) {
      unchanged++
      continue
    }

    // Wipe and re-insert.
    const { error: delErr } = await supabase
      .from('predictions')
      .delete()
      .eq('player_id', playerId)
      .eq('season_id', season.id)
    if (delErr) {
      console.log(`  ✗ ${p.name}: delete failed — ${delErr.message}`)
      continue
    }
    const { error: insErr } = await supabase.from('predictions').insert(newRows)
    if (insErr) {
      console.log(`  ✗ ${p.name}: insert failed — ${insErr.message}`)
      continue
    }
    console.log(`  ✓ ${p.name}: positions updated`)
    updated++
  }

  console.log(`\nUpdated:   ${updated}`)
  console.log(`Unchanged: ${unchanged}`)
  console.log(`Missing:   ${missing}`)
  console.log('\nNext: run "npm run scores:calculate" to refresh the leaderboard.')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

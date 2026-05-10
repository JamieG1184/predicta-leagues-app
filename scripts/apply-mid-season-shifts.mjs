// Predicta Leagues — Apply mid-season shifts from spreadsheet.
//
// Reads mid-season-shifts.json (generated from "2025-26 Updated Predictions.xlsx")
// and for each player:
//   1. Wipes their current predictions
//   2. Inserts the new post-shift predictions (preserving Joker selection)
//   3. Records the shift in the shifts table for audit
//
// Idempotent: re-running it will overwrite the same data.
//
// Run with:
//   npm run shifts:apply

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
  console.log('Predicta Leagues — Apply mid-season shifts\n')

  // 1. Load the shift data
  const data = JSON.parse(
    readFileSync(join(projectRoot, 'mid-season-shifts.json'), 'utf-8')
  )
  console.log(`Loaded ${data.shifts.length} shifts to apply`)

  // 2. Look up season + teams + players
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
  const { data: players } = await supabase.from('players').select('id, display_name')
  const playerIdByName = new Map(players.map((p) => [p.display_name, p.id]))

  let applied = 0
  let skipped = 0
  let failed = 0

  for (const shift of data.shifts) {
    const playerId = playerIdByName.get(shift.player_name)
    const movedTeamId = teamIdByName.get(shift.moved_team)
    if (!playerId) {
      console.log(`  ⚠ ${shift.player_name}: player not in DB — skipping`)
      skipped++
      continue
    }
    if (!movedTeamId) {
      console.log(`  ⚠ ${shift.player_name}: team "${shift.moved_team}" not in DB — skipping`)
      skipped++
      continue
    }

    // Build prediction rows with team_ids resolved
    const predictionRows = []
    let badTeam = null
    for (const p of shift.updated_predictions) {
      const teamId = teamIdByName.get(p.team)
      if (!teamId) {
        badTeam = p.team
        break
      }
      predictionRows.push({
        player_id: playerId,
        season_id: season.id,
        position: p.position,
        team_id: teamId,
        is_joker: p.is_joker,
      })
    }
    if (badTeam) {
      console.log(`  ⚠ ${shift.player_name}: team "${badTeam}" not in DB — skipping`)
      failed++
      continue
    }

    // 3. Wipe and re-insert predictions
    const { error: delErr } = await supabase
      .from('predictions')
      .delete()
      .eq('player_id', playerId)
      .eq('season_id', season.id)
    if (delErr) {
      console.log(`  ✗ ${shift.player_name}: delete failed — ${delErr.message}`)
      failed++
      continue
    }
    const { error: insErr } = await supabase.from('predictions').insert(predictionRows)
    if (insErr) {
      console.log(`  ✗ ${shift.player_name}: insert failed — ${insErr.message}`)
      failed++
      continue
    }

    // 4. Record the shift in the shifts table (upsert in case it already exists)
    await supabase
      .from('shifts')
      .delete()
      .eq('player_id', playerId)
      .eq('season_id', season.id)
    const { error: shiftErr } = await supabase.from('shifts').insert({
      player_id: playerId,
      season_id: season.id,
      team_id: movedTeamId,
      old_position: shift.old_position,
      new_position: shift.new_position,
      applied_by: 'spreadsheet_import',
    })
    if (shiftErr) {
      console.log(`  ⚠ ${shift.player_name}: predictions updated but shift record failed — ${shiftErr.message}`)
    }

    console.log(
      `  ✓ ${shift.player_name.padEnd(28)} ${shift.moved_team} #${shift.old_position} → #${shift.new_position}`
    )
    applied++
  }

  console.log(`\nApplied: ${applied}  Skipped: ${skipped}  Failed: ${failed}`)
  console.log('\nNext: run "npm run scores:calculate" to refresh scores.')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

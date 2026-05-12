// Predicta Leagues — Apply master predictions from beta-master.json.
//
// Single source of truth for the rest of the 2025/26 season is
// "2026 beta predicta league players.xlsx" (parsed into beta-master.json).
// This file carries BOTH the current positions AND each player's Joker
// selection. Running this script overwrites each player's predictions in
// the DB to match the spreadsheet exactly.
//
// Players in the spreadsheet but NOT in the DB are skipped with a warning
// (e.g. Rebecca McCairns if she remains intentionally excluded). Players
// in the DB but NOT in the spreadsheet are left untouched.
//
// Idempotent — safe to re-run. Run with:
//   node --env-file=.env.local scripts/apply-master-predictions.mjs

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
  console.log('Predicta Leagues — Apply master predictions (beta-master.json)\n')

  const players = JSON.parse(
    readFileSync(join(projectRoot, 'beta-master.json'), 'utf-8')
  )
  console.log(`Loaded ${players.length} players from beta-master.json`)

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
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))

  const { data: dbPlayers } = await supabase
    .from('players')
    .select('id, display_name')
  const playerIdByName = new Map(
    dbPlayers.map((p) => [p.display_name, p.id])
  )

  let updated = 0
  let unchanged = 0
  let missing = 0
  let teamErrors = 0

  for (const p of players) {
    const playerId = playerIdByName.get(p.name)
    if (!playerId) {
      console.log(`  ⚠ ${p.name} — not in DB (skipping)`)
      missing++
      continue
    }

    // Build the desired rows from the spreadsheet.
    const newRows = []
    let bad = false
    for (const pred of p.predictions) {
      const teamId = teamIdByName.get(pred.team)
      if (!teamId) {
        console.log(`  ✗ ${p.name}: unknown team "${pred.team}" — skipping player`)
        bad = true
        break
      }
      newRows.push({
        player_id: playerId,
        season_id: season.id,
        position: pred.position,
        team_id: teamId,
        is_joker: !!pred.is_joker,
      })
    }
    if (bad) {
      teamErrors++
      continue
    }

    // Diff against the current DB state.
    const { data: currentPreds } = await supabase
      .from('predictions')
      .select('team_id, position, is_joker')
      .eq('player_id', playerId)
      .eq('season_id', season.id)

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

    // Wipe and re-insert (atomic at the player level).
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
    const jokerTeam =
      newRows.find((r) => r.is_joker)
        ? teamNameById.get(newRows.find((r) => r.is_joker).team_id)
        : '—'
    console.log(`  ✓ ${p.name}: predictions synced (Joker: ${jokerTeam})`)
    updated++
  }

  console.log(`\nUpdated:     ${updated}`)
  console.log(`Unchanged:   ${unchanged}`)
  console.log(`Missing:     ${missing}`)
  console.log(`Team errors: ${teamErrors}`)
  console.log('\nNext: run "npm run scores:calculate" to refresh the leaderboard.')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

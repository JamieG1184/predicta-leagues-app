// Predicta Leagues — Apply original-prediction corrections to the DB.
//
// The new "2025-26 Original Predictions SF" spreadsheet contains corrections
// to the season-opening predictions. This script reconciles those into the
// database WITHOUT clobbering any mid-season shifts that have been applied.
//
// What it does (idempotent — safe to re-run):
//
//   1. PLAYER ROSTER FIXES
//      - Rename "Izza Zdrondowska" → "Izza Zdrodowska" (typo fix)
//      - (Rebecca McCairns is intentionally excluded from this league.)
//
//   2. PREDICTIONS UPDATES
//      For each player whose seed (original) prediction differs from what's
//      currently in the DB:
//
//      (a) If the player is NOT in the `shifts` table, their current
//          predictions ARE their originals, so we wipe + re-insert from the
//          new seed. (Affects Scott Ferguson.)
//
//      (b) If the player IS in the `shifts` table, their current predictions
//          are post-shift state. We only flip the is_joker flag in the DB to
//          reflect the corrected Joker selection — positions stay untouched.
//          (Affects Jamie Gillson + Rachael Hill.)
//
//   3. SCORE RECALC
//      Runs after all updates to refresh the leaderboard.
//
// Run with:
//   node --env-file=.env.local scripts/apply-original-corrections.mjs

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
  console.log('Predicta Leagues — Apply original-prediction corrections\n')

  // 1. Load the (already-corrected) seed JSON.
  const seed = JSON.parse(readFileSync(join(projectRoot, 'seed-data-2025-26.json'), 'utf-8'))
  console.log(`Loaded ${seed.players.length} players from seed-data-2025-26.json`)

  // 2. Look up season + teams + players + shifts.
  const { data: season } = await supabase.from('seasons').select('id').eq('is_current', true).single()
  if (!season) {
    console.error('No current season found.')
    process.exit(1)
  }
  const { data: teams } = await supabase.from('teams').select('id, name')
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]))
  const teamNameById = new Map(teams.map((t) => [t.id, t.name]))

  // 3. Roster fixes BEFORE we read players (so subsequent queries see the fixed state).
  //
  // 3a. Rename Izza if she's still on the old spelling.
  const { data: oldIzza } = await supabase
    .from('players')
    .select('id, display_name')
    .eq('display_name', 'Izza Zdrondowska')
    .maybeSingle()
  if (oldIzza) {
    const { error } = await supabase
      .from('players')
      .update({ display_name: 'Izza Zdrodowska' })
      .eq('id', oldIzza.id)
    if (error) {
      console.log(`  ✗ Failed to rename Izza: ${error.message}`)
    } else {
      console.log('  ✓ Renamed "Izza Zdrondowska" → "Izza Zdrodowska"')
    }
  } else {
    // Check whether the new spelling already exists (idempotency).
    const { data: newIzza } = await supabase
      .from('players')
      .select('id')
      .eq('display_name', 'Izza Zdrodowska')
      .maybeSingle()
    if (newIzza) console.log('  • Izza already on correct spelling')
  }

  // 3b. (Rebecca McCairns is intentionally excluded from this league — no insert.)

  // 4. Now read the full player roster (post-fixes).
  const { data: players } = await supabase.from('players').select('id, display_name')
  const playerIdByName = new Map(players.map((p) => [p.display_name, p.id]))

  // 5. Read current predictions and shifts.
  const { data: dbPreds } = await supabase
    .from('predictions')
    .select('player_id, position, team_id, is_joker')
    .eq('season_id', season.id)
  const dbByPlayer = new Map()
  for (const p of dbPreds) {
    if (!dbByPlayer.has(p.player_id)) dbByPlayer.set(p.player_id, [])
    dbByPlayer.get(p.player_id).push(p)
  }

  const { data: shifts } = await supabase
    .from('shifts')
    .select('player_id')
    .eq('season_id', season.id)
  const shiftedPlayerIds = new Set(shifts.map((s) => s.player_id))

  // 6. Walk through each seed player and apply the right kind of update.
  let updatedNonShifted = 0
  let updatedJokerOnly = 0
  let unchanged = 0
  let missing = 0

  for (const seedPlayer of seed.players) {
    const playerId = playerIdByName.get(seedPlayer.name)
    if (!playerId) {
      console.log(`  ⚠ ${seedPlayer.name} — not in DB; skipping`)
      missing++
      continue
    }

    const seedJoker = seedPlayer.joker_team
    const dbRows = dbByPlayer.get(playerId) ?? []
    const isShifted = shiftedPlayerIds.has(playerId)

    // Build seed prediction map for diff.
    const seedByPos = new Map(seedPlayer.predictions.map((p) => [p.position, p.team]))
    const dbByPos = new Map(dbRows.map((r) => [r.position, teamNameById.get(r.team_id)]))
    const currentJokerRow = dbRows.find((r) => r.is_joker)
    const currentJokerTeam = currentJokerRow ? teamNameById.get(currentJokerRow.team_id) : null

    // Quick equality check (ignoring shift case for now).
    let predictionsMatch = dbRows.length === seedPlayer.predictions.length
    if (predictionsMatch) {
      for (const sp of seedPlayer.predictions) {
        if (dbByPos.get(sp.position) !== sp.team) {
          predictionsMatch = false
          break
        }
      }
    }
    const jokerMatches = currentJokerTeam === seedJoker

    if (predictionsMatch && jokerMatches) {
      unchanged++
      continue
    }

    if (!isShifted) {
      // Wipe and re-insert FULL predictions (DB current === original for non-shifted).
      const rows = seedPlayer.predictions.map((p) => {
        const teamId = teamIdByName.get(p.team)
        if (!teamId) throw new Error(`Unknown team "${p.team}" for ${seedPlayer.name}`)
        return {
          player_id: playerId,
          season_id: season.id,
          position: p.position,
          team_id: teamId,
          is_joker: p.team === seedJoker,
        }
      })
      const { error: delErr } = await supabase
        .from('predictions')
        .delete()
        .eq('player_id', playerId)
        .eq('season_id', season.id)
      if (delErr) {
        console.log(`  ✗ ${seedPlayer.name}: delete failed — ${delErr.message}`)
        continue
      }
      const { error: insErr } = await supabase.from('predictions').insert(rows)
      if (insErr) {
        console.log(`  ✗ ${seedPlayer.name}: insert failed — ${insErr.message}`)
        continue
      }
      console.log(`  ✓ ${seedPlayer.name} (non-shifted): predictions rewritten`)
      updatedNonShifted++
    } else {
      // Shifted player — positions are post-shift, only fix joker.
      if (jokerMatches) {
        unchanged++
        continue
      }
      const newJokerTeamId = teamIdByName.get(seedJoker)
      if (!newJokerTeamId) {
        console.log(`  ⚠ ${seedPlayer.name}: joker team "${seedJoker}" not in DB`)
        continue
      }
      // Step 1: clear ALL is_joker flags for this player (safe, idempotent).
      const { error: clearErr } = await supabase
        .from('predictions')
        .update({ is_joker: false })
        .eq('player_id', playerId)
        .eq('season_id', season.id)
      if (clearErr) {
        console.log(`  ✗ ${seedPlayer.name}: failed to clear joker — ${clearErr.message}`)
        continue
      }
      // Step 2: set is_joker=true on the corrected team (only if that team is in their predictions).
      const { data: targetRows, error: setErr } = await supabase
        .from('predictions')
        .update({ is_joker: true })
        .eq('player_id', playerId)
        .eq('season_id', season.id)
        .eq('team_id', newJokerTeamId)
        .select('position')
      if (setErr) {
        console.log(`  ✗ ${seedPlayer.name}: failed to set joker — ${setErr.message}`)
        continue
      }
      if (!targetRows || targetRows.length === 0) {
        console.log(`  ⚠ ${seedPlayer.name}: joker team "${seedJoker}" not in their predictions — skipped (positions are post-shift)`)
        continue
      }
      console.log(`  ✓ ${seedPlayer.name} (shifted): joker → ${seedJoker} (#${targetRows[0].position})`)
      updatedJokerOnly++
    }
  }

  console.log(`\nNon-shifted predictions rewritten: ${updatedNonShifted}`)
  console.log(`Shifted players joker-corrected:    ${updatedJokerOnly}`)
  console.log(`Unchanged:                          ${unchanged}`)
  console.log(`Missing from DB:                    ${missing}`)
  console.log(`\nNext: run "npm run scores:calculate" to refresh the leaderboard.`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

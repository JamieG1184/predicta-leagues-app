// Predicta Leagues — Database seed script
// Loads the 30 players, 20 teams, and all predictions from
// seed-data-2025-26.json into Supabase.
//
// Run with:
//   npm run db:seed
//
// or directly:
//   node --env-file=.env.local scripts/seed.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

// --- Connect to Supabase ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables.')
  console.error('Expected NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
})

// --- Helpers ---

function inviteCode(len = 8) {
  // Friendly base32-style code for the soft-launch private link
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(randomBytes(len))
    .map((b) => alphabet[b % alphabet.length])
    .join('')
}

async function clearTable(name) {
  // Use a "select all IDs, then delete by ID" pattern — works robustly
  // across Supabase API key types and respects foreign key order.
  const { data, error: selErr } = await supabase.from(name).select('id')
  if (selErr) throw selErr
  if (!data || data.length === 0) return 0
  const ids = data.map((r) => r.id)
  const { error: delErr } = await supabase.from(name).delete().in('id', ids)
  if (delErr) throw delErr
  return ids.length
}

async function clearExisting() {
  // Safety guard: refuse to wipe unless explicitly confirmed.
  // Pass --force on the command line OR set ALLOW_WIPE=1 in .env.local
  const allowWipe = process.argv.includes('--force') || process.env.ALLOW_WIPE === '1'
  if (!allowWipe) {
    console.log(
      '\n⚠ Skipping clearExisting() — refusing to wipe data without --force flag.\n  To reseed, run: npm run db:seed -- --force\n'
    )
    return
  }
  console.log('Clearing existing data (--force flag set)...')
  for (const t of [
    'score_snapshots',
    'actual_standings',
    'predictions',
    'players',
    'teams',
    'seasons',
  ]) {
    const n = await clearTable(t)
    if (n > 0) console.log(`  cleared ${n} from ${t}`)
  }
}

// --- Main seed flow ---

async function main() {
  console.log('Predicta Leagues — Seeding database\n')

  // 1. Read the source data
  const dataPath = join(projectRoot, 'seed-data-2025-26.json')
  const seed = JSON.parse(readFileSync(dataPath, 'utf-8'))
  console.log(`Loaded ${seed.players.length} players from ${dataPath}`)

  // 2. Clear any existing rows (idempotent re-runs)
  await clearExisting()

  // 3. Create the season
  const { data: seasonRow, error: seasonErr } = await supabase
    .from('seasons')
    .insert({
      name: seed.season,
      start_date: '2025-08-15',
      end_date: '2026-05-24',
      is_current: true,
    })
    .select('id')
    .single()
  if (seasonErr) throw seasonErr
  const seasonId = seasonRow.id
  console.log(`Created season "${seed.season}" (id=${seasonId})`)

  // 4. Collect all unique team names from the predictions and insert
  const teamNames = new Set()
  for (const player of seed.players) {
    for (const p of player.predictions) {
      teamNames.add(p.team)
    }
  }
  const teamRows = Array.from(teamNames)
    .sort()
    .map((name) => ({ name }))
  const { data: insertedTeams, error: teamErr } = await supabase
    .from('teams')
    .insert(teamRows)
    .select('id, name')
  if (teamErr) throw teamErr
  console.log(`Created ${insertedTeams.length} teams`)

  const teamIdByName = new Map(insertedTeams.map((t) => [t.name, t.id]))

  // 5. Insert the 30 players with random invite codes
  const playerRows = seed.players.map((p) => ({
    display_name: p.name,
    invite_code: inviteCode(),
  }))
  const { data: insertedPlayers, error: playerErr } = await supabase
    .from('players')
    .insert(playerRows)
    .select('id, display_name, invite_code')
  if (playerErr) throw playerErr
  console.log(`Created ${insertedPlayers.length} players`)

  const playerIdByName = new Map(insertedPlayers.map((p) => [p.display_name, p.id]))

  // 6. Insert all predictions (~600 rows)
  const predictionRows = []
  for (const player of seed.players) {
    const playerId = playerIdByName.get(player.name)
    for (const p of player.predictions) {
      const teamId = teamIdByName.get(p.team)
      if (!teamId) {
        console.warn(`Warning: unknown team "${p.team}" for ${player.name}`)
        continue
      }
      predictionRows.push({
        player_id: playerId,
        season_id: seasonId,
        position: p.position,
        team_id: teamId,
        is_joker: p.team === player.joker_team,
      })
    }
  }
  const { error: predErr } = await supabase.from('predictions').insert(predictionRows)
  if (predErr) throw predErr
  console.log(`Created ${predictionRows.length} predictions`)

  // 7. Print a summary including invite codes for easy reference
  console.log('\nSeed complete. Invite codes (save these to share with players):')
  for (const p of insertedPlayers) {
    console.log(`  ${p.display_name.padEnd(28)} ${p.invite_code}`)
  }
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})

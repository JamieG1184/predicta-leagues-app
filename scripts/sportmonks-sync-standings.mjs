// Predicta Leagues — Sync the current PL table from Sportmonks into our DB.
//
// What this does, end-to-end:
//   1. Reads our season ('2025-26') and team mapping (sportmonks_id) from Supabase.
//   2. Fetches the current PL standings from Sportmonks.
//   3. Translates each Sportmonks team_id → our team_id using the mapping.
//   4. Upserts (insert-or-update) one row per team into actual_standings.
//
// Run with:
//   npm run sportmonks:sync-standings

import { createClient } from '@supabase/supabase-js'

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football'
const PL_LEAGUE_ID = 8
const PL_SEASON_ID = 25583 // 2025/26

const token = process.env.SPORTMONKS_API_TOKEN
if (!token) {
  console.error('Missing SPORTMONKS_API_TOKEN')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function sportmonks(path) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${SPORTMONKS_BASE}${path}${sep}api_token=${token}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Sportmonks ${res.status}: ${await res.text()}`)
  return await res.json()
}

async function main() {
  console.log('Predicta Leagues — Standings sync\n')

  // 1. Look up our season row
  const { data: season, error: sErr } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('name', '2025-26')
    .single()
  if (sErr || !season) {
    throw new Error(`Could not find season "2025-26" in DB: ${sErr?.message}`)
  }
  console.log(`Our season: id=${season.id} "${season.name}"`)

  // 2. Build a sportmonks_id → our team_id map
  const { data: teams, error: tErr } = await supabase
    .from('teams')
    .select('id, name, sportmonks_id')
  if (tErr) throw tErr
  const teamIdBySportmonks = new Map()
  for (const t of teams) {
    if (t.sportmonks_id) teamIdBySportmonks.set(t.sportmonks_id, { id: t.id, name: t.name })
  }
  console.log(`Loaded ${teamIdBySportmonks.size} team mappings`)

  // 3. Fetch the live standings from Sportmonks
  console.log(`Fetching standings for Sportmonks season ${PL_SEASON_ID}...`)
  const resp = await sportmonks(`/standings/seasons/${PL_SEASON_ID}`)
  const rows = resp.data ?? []
  if (rows.length === 0) throw new Error('Sportmonks returned no standings rows')
  console.log(`Got ${rows.length} standings rows`)

  // 4. Build the rows we'll write to actual_standings
  const upsertRows = []
  const unmapped = []
  for (const r of rows) {
    const local = teamIdBySportmonks.get(r.participant_id)
    if (!local) {
      unmapped.push(r.participant_id)
      continue
    }
    upsertRows.push({
      season_id: season.id,
      team_id: local.id,
      position: r.position,
      points: r.points ?? 0,
      // The fields below aren't in our restricted Sportmonks plan response.
      // We leave them at their default (0) and will only populate them when
      // we have access to richer match data.
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
      goal_difference: 0,
      updated_at: new Date().toISOString(),
    })
  }
  if (unmapped.length > 0) {
    console.log(`⚠ Unmapped Sportmonks team IDs: ${unmapped.join(', ')}`)
  }
  console.log(`Prepared ${upsertRows.length} rows for upsert`)

  // 5. Upsert into actual_standings (insert if missing, update if present).
  //    We rely on the unique (season_id, team_id) constraint to identify rows.
  const { error: upErr } = await supabase
    .from('actual_standings')
    .upsert(upsertRows, { onConflict: 'season_id,team_id' })
  if (upErr) throw upErr
  console.log('Upsert successful.\n')

  // 6. Read it back and print a clean table for confirmation
  const { data: final } = await supabase
    .from('actual_standings')
    .select('position, points, team_id, teams(name)')
    .eq('season_id', season.id)
    .order('position')

  console.log('Current Premier League table (from our DB):\n')
  console.log('Pos'.padEnd(4), 'Team'.padEnd(28), 'Pts'.padStart(4))
  console.log('-'.repeat(40))
  for (const row of final) {
    console.log(
      String(row.position).padEnd(4),
      (row.teams?.name ?? `[id=${row.team_id}]`).slice(0, 28).padEnd(28),
      String(row.points).padStart(4)
    )
  }
}

main().catch((err) => {
  console.error('\nSync failed:', err.message)
  process.exit(1)
})

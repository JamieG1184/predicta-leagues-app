// Predicta Leagues — Sync Premier League fixtures from Sportmonks.
//
// Pulls fixtures for the current PL season, parses the "Team A vs Team B"
// fixture name to identify home/away teams, maps them to our team_id, and
// upserts the result into the `fixtures` table.
//
// Run with:
//   npm run sportmonks:sync-fixtures

import { createClient } from '@supabase/supabase-js'

const SPORTMONKS_BASE = 'https://api.sportmonks.com/v3/football'
const PL_SEASON_ID = 25583

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

// Sportmonks names some teams differently from how our DB stores them.
// Adjust these so a parsed name from a fixture string matches a team in our DB.
const TEAM_NAME_ALIASES = new Map([
  ['AFC Bournemouth', 'Bournemouth'],
])

function normalizeTeamName(rawName) {
  return TEAM_NAME_ALIASES.get(rawName) ?? rawName
}

function parseFixtureName(name) {
  // Expected format: "Home Team vs Away Team"
  if (!name || !name.includes(' vs ')) return null
  const [home, away] = name.split(' vs ').map((s) => s.trim())
  return { home: normalizeTeamName(home), away: normalizeTeamName(away) }
}

async function main() {
  console.log('Predicta Leagues — Fixture sync\n')

  // 1. Look up our season + team mapping
  const { data: season } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('name', '2025-26')
    .single()
  if (!season) throw new Error('Season 2025-26 not found in DB')
  console.log(`Season: ${season.name} (id=${season.id})`)

  const { data: teams } = await supabase.from('teams').select('id, name')
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]))
  console.log(`Loaded ${teamIdByName.size} teams\n`)

  // 2. Fetch fixtures for the whole season in 90-day chunks
  //    (Sportmonks limits each /between request to a max 100-day span.)
  console.log('Fetching fixtures from Sportmonks...')
  const allFixtures = []
  const chunks = [
    ['2025-08-01', '2025-10-29'],
    ['2025-10-30', '2026-01-27'],
    ['2026-01-28', '2026-04-27'],
    ['2026-04-28', '2026-06-01'],
  ]
  for (const [from, to] of chunks) {
    let page = 1
    for (;;) {
      const data = await sportmonks(
        `/fixtures/between/${from}/${to}?per_page=50&page=${page}`
      )
      const list = data.data ?? []
      const pl = list.filter((f) => f.season_id === PL_SEASON_ID)
      allFixtures.push(...pl)
      const hasMore = data.pagination?.has_more === true
      if (!hasMore || list.length === 0) break
      page++
      if (page > 20) break // safety cap
    }
    console.log(`  ${from} → ${to}: running total ${allFixtures.length}`)
  }
  console.log(`Got ${allFixtures.length} PL fixtures total\n`)

  // 3. Parse names, build upsert rows, track unmatched teams
  const upsertRows = []
  const unmatched = new Set()
  for (const f of allFixtures) {
    const parsed = parseFixtureName(f.name)
    if (!parsed) {
      console.log(`  Could not parse: ${f.id} "${f.name}"`)
      continue
    }
    const homeId = teamIdByName.get(parsed.home)
    const awayId = teamIdByName.get(parsed.away)
    if (!homeId) unmatched.add(parsed.home)
    if (!awayId) unmatched.add(parsed.away)
    upsertRows.push({
      sportmonks_id: f.id,
      season_id: season.id,
      home_team_id: homeId ?? null,
      away_team_id: awayId ?? null,
      starting_at: f.starting_at,
      state_id: f.state_id,
      result_info: f.result_info,
      fixture_name: f.name,
      updated_at: new Date().toISOString(),
    })
  }
  if (unmatched.size > 0) {
    console.log(`⚠ Unmatched team names: ${[...unmatched].join(', ')}`)
  }
  console.log(`Prepared ${upsertRows.length} fixture rows for upsert`)

  // 4. Upsert in batches
  const batchSize = 100
  for (let i = 0; i < upsertRows.length; i += batchSize) {
    const batch = upsertRows.slice(i, i + batchSize)
    const { error } = await supabase.from('fixtures').upsert(batch, {
      onConflict: 'sportmonks_id',
    })
    if (error) throw error
  }
  console.log('Upsert complete.\n')

  // 5. Summary by state
  const stateBuckets = new Map()
  for (const f of upsertRows) {
    const k = f.state_id ?? 'unknown'
    stateBuckets.set(k, (stateBuckets.get(k) ?? 0) + 1)
  }
  console.log('Fixtures by state_id:')
  for (const [k, v] of stateBuckets) console.log(`  state_id=${k}: ${v}`)

  // 6. Show next ~10 upcoming
  const upcoming = upsertRows
    .filter((f) => new Date(f.starting_at) >= new Date())
    .sort((a, b) => new Date(a.starting_at) - new Date(b.starting_at))
    .slice(0, 10)
  if (upcoming.length > 0) {
    console.log('\nNext upcoming fixtures:')
    for (const f of upcoming) {
      console.log(`  ${f.starting_at}  ${f.fixture_name}`)
    }
  }
}

main().catch((err) => {
  console.error('\nSync failed:', err.message)
  process.exit(1)
})

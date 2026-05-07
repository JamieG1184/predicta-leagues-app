// Predicta Leagues — Sportmonks discovery script
// Fetches the current PL standings and resolves every team id to a name
// by hitting /teams/{id} individually.

const token = process.env.SPORTMONKS_API_TOKEN
if (!token) {
  console.error('Missing SPORTMONKS_API_TOKEN in .env.local')
  process.exit(1)
}

const BASE = 'https://api.sportmonks.com/v3/football'

async function api(path) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE}${path}${sep}api_token=${token}`
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sportmonks ${res.status} on ${path}: ${text}`)
  }
  return await res.json()
}

async function main() {
  console.log('Predicta Leagues — Sportmonks discovery\n')

  console.log('1. Looking up Premier League and current season...')
  const leagues = await api('/leagues?per_page=50')
  const pl = leagues.data.find((l) => l.name?.toLowerCase().includes('premier league'))
  const seasons = await api(`/seasons?filters=seasonLeagues:${pl.id}&per_page=50`)
  const current =
    seasons.data.find((s) => s.is_current) ??
    seasons.data.sort((a, b) => (b.starting_at ?? '').localeCompare(a.starting_at ?? ''))[0]
  console.log(`   PL id=${pl.id}  season id=${current.id} "${current.name}"\n`)

  console.log('2. Fetching standings...')
  const standings = await api(`/standings/seasons/${current.id}`)
  console.log(`   Got ${standings.data.length} rows.`)
  console.log('   Inspecting first row to see what fields are available:')
  console.log(JSON.stringify(standings.data[0], null, 2))
  console.log()

  console.log('3. Resolving team names via /teams/{id} (one request per team)...')
  const teamIds = [...new Set(standings.data.map((r) => r.participant_id))]
  const teamNameById = new Map()
  for (const id of teamIds) {
    try {
      const resp = await api(`/teams/${id}`)
      teamNameById.set(id, resp.data?.name ?? `[id=${id}]`)
    } catch (err) {
      console.log(`     could not fetch team ${id}: ${err.message}`)
      teamNameById.set(id, `[id=${id}]`)
    }
  }
  console.log(`   Resolved ${teamNameById.size} team names.\n`)

  console.log('4. Current Premier League table:\n')
  console.log('Pos'.padEnd(4), 'Team'.padEnd(30), 'Pts'.padStart(4))
  console.log('-'.repeat(42))
  for (const row of standings.data.sort((a, b) => a.position - b.position)) {
    const name = teamNameById.get(row.participant_id) ?? `[id=${row.participant_id}]`
    console.log(
      String(row.position).padEnd(4),
      name.slice(0, 30).padEnd(30),
      String(row.points ?? '?').padStart(4)
    )
  }

  console.log('\n5. Sportmonks team-name list (for matching to our database):')
  for (const [id, name] of [...teamNameById.entries()].sort((a, b) =>
    (a[1] ?? '').localeCompare(b[1] ?? '')
  )) {
    console.log(`     ${String(id).padStart(5)}  ${name}`)
  }

  console.log('\n✓ Discovery complete.')
  console.log(`   PREMIER_LEAGUE_ID=${pl.id}`)
  console.log(`   CURRENT_SEASON_ID=${current.id}`)
}

main().catch((err) => {
  console.error('Discovery failed:', err.message)
  process.exit(1)
})

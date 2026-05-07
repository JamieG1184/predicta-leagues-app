// Print actual fixture data to extract team names

const token = process.env.SPORTMONKS_API_TOKEN
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
  console.log('Fetching recent PL fixtures and inspecting raw data...\n')

  // Pull fixtures from the last few weeks of the 2025/26 PL season
  const data = await api('/fixtures/between/2026-04-01/2026-05-25?per_page=50')
  console.log(`Got ${data.data?.length ?? 0} fixtures in date range.\n`)

  // Filter to just our PL season
  const pl = data.data.filter((f) => f.season_id === 25583)
  console.log(`${pl.length} of those are PL 2025/26.\n`)

  console.log('Inspecting first PL fixture in detail:\n')
  console.log(JSON.stringify(pl[0], null, 2))

  console.log('\n\nAll PL fixture names (this is what we extract team names from):\n')
  for (const f of pl.slice(0, 20)) {
    console.log(`  ${f.starting_at}  "${f.name}"`)
  }
}

main().catch((err) => console.error('Test failed:', err))

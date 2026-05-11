import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Load seed
const seed = JSON.parse(readFileSync('seed-data-2025-26.json', 'utf-8'))
const seedByName = new Map()
for (const p of seed.players ?? []) {
  seedByName.set(p.name, {
    joker: p.joker_team,
    preds: (p.predictions ?? []).map(x => ({ position: x.position, team: x.team }))
  })
}

// Load new spreadsheet
const newSheet = JSON.parse(readFileSync('/tmp/new-originals.json', 'utf-8'))

// Load current DB
const { data: season, error: seasonErr } = await sb.from('seasons').select('id').eq('is_current', true).single()
if (seasonErr || !season) { console.error('Season error:', seasonErr); process.exit(1) }
const { data: teams, error: teamsErr } = await sb.from('teams').select('id, name')
if (teamsErr) { console.error('Teams error:', teamsErr); process.exit(1) }
const teamNameById = new Map(teams.map(t => [t.id, t.name]))
const { data: players, error: playersErr } = await sb.from('players').select('id, display_name')
if (playersErr) { console.error('Players error:', playersErr); process.exit(1) }
const playerNameById = new Map(players.map(p => [p.id, p.display_name]))
const { data: dbPreds, error: predsErr } = await sb.from('predictions').select('player_id, position, team_id, is_joker').eq('season_id', season.id)
if (predsErr) { console.error('Preds error:', predsErr); process.exit(1) }
const dbByName = new Map()
for (const p of dbPreds) {
  const name = playerNameById.get(p.player_id)
  if (!name) continue
  if (!dbByName.has(name)) dbByName.set(name, [])
  dbByName.get(name).push({ position: p.position, team: teamNameById.get(p.team_id), is_joker: p.is_joker })
}
const { data: shifts, error: shErr } = await sb.from('shifts').select('player_id').eq('season_id', season.id)
if (shErr) { console.error('Shifts error:', shErr); process.exit(1) }
const shiftedPlayerNames = new Set(shifts.map(s => playerNameById.get(s.player_id)).filter(Boolean))

console.log(`Spreadsheet:    ${newSheet.length} players`)
console.log(`Seed JSON:      ${seedByName.size} players`)
console.log(`DB predictions: ${dbByName.size} players`)
console.log(`DB shifts:      ${shiftedPlayerNames.size} players have been shifted`)
console.log(`Shifted: ${[...shiftedPlayerNames].sort().join(', ')}`)

// Compare new spreadsheet vs seed JSON (the existing "originals" source)
console.log('\n=== NEW SPREADSHEET vs SEED JSON (the existing originals on record) ===')
let seedDiffs = 0
const seedDiffDetails = []
for (const np of newSheet) {
  const s = seedByName.get(np.name)
  if (!s) {
    seedDiffDetails.push({ name: np.name, diffs: ['NOT IN SEED'] })
    seedDiffs++
    continue
  }
  const newJoker = np.predictions.find(x => x.is_joker)?.team ?? null
  const diffs = []
  if (s.joker !== newJoker) diffs.push(`Joker: ${s.joker} → ${newJoker}`)
  const newByPos = new Map(np.predictions.map(p => [p.position, p.team]))
  const seedByPos = new Map(s.preds.map(p => [p.position, p.team]))
  for (let pos = 1; pos <= 20; pos++) {
    const a = seedByPos.get(pos)
    const b = newByPos.get(pos)
    if (a !== b) diffs.push(`#${pos}: ${a ?? '—'} → ${b ?? '—'}`)
  }
  if (diffs.length > 0) {
    seedDiffs++
    seedDiffDetails.push({ name: np.name, diffs })
  }
}
for (const d of seedDiffDetails) {
  console.log(`\n  ${d.name}${shiftedPlayerNames.has(d.name) ? ' (SHIFTED)' : ''}:`)
  for (const c of d.diffs) console.log(`    - ${c}`)
}
console.log(`\nTotal players with seed differences: ${seedDiffs}`)

const newNames = new Set(newSheet.map(p => p.name))
const onlyInSeed = [...seedByName.keys()].filter(n => !newNames.has(n))
if (onlyInSeed.length) {
  console.log('\n=== Players in seed JSON but NOT in new spreadsheet ===')
  onlyInSeed.forEach(n => console.log(`  - ${n}`))
}

// Save the report
writeFileSync('/tmp/seed-diff-report.json', JSON.stringify({ seedDiffDetails, onlyInSeed, shiftedPlayerNames: [...shiftedPlayerNames] }, null, 2))

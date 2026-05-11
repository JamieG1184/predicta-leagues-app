// Quick diagnostic: print the most recent score snapshots for two players
// so we can see whether there's meaningful history for the position-change
// arrows to compare against. Safe to delete after diagnosing.

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const { data: snaps } = await sb
  .from('score_snapshots')
  .select('snapshot_at, cumulative_score, player_id, trigger_event')
  .order('snapshot_at', { ascending: false })
  .limit(300)

const { data: players } = await sb.from('players').select('id, display_name')
const byId = new Map(players.map((p) => [p.id, p.display_name]))

const byTime = new Map()
for (const r of snaps) {
  if (!byTime.has(r.snapshot_at)) {
    byTime.set(r.snapshot_at, { scores: new Map(), trigger: r.trigger_event })
  }
  byTime.get(r.snapshot_at).scores.set(byId.get(r.player_id), r.cumulative_score)
}

const times = [...byTime.keys()].sort().reverse().slice(0, 10)
console.log(`\nFound ${byTime.size} distinct snapshot times. Showing 10 most recent:\n`)
console.log(
  'snapshot_at'.padEnd(28),
  '| trigger'.padEnd(20),
  '| Scott',
  '| Patrick',
  '| Jamie',
  '| Rachael'
)
console.log('-'.repeat(110))
for (const t of times) {
  const b = byTime.get(t)
  console.log(
    t.padEnd(28),
    '| ' + (b.trigger ?? '?').padEnd(18),
    '|',
    String(b.scores.get('Scott Ferguson') ?? '-').padStart(4),
    '|',
    String(b.scores.get('Patrick Leach') ?? '-').padStart(7),
    '|',
    String(b.scores.get('Jamie Gillson') ?? '-').padStart(4),
    '|',
    String(b.scores.get('Rachael Hill') ?? '-').padStart(6)
  )
}

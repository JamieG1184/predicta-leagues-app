// Predicta Leagues — Generate a demo back-dated snapshot.
// Inserts a synthetic "previous" snapshot 3 days ago with mildly perturbed
// scores, so the /digest page has real content to render. Useful for demoing
// the page before you have two real snapshots from successive match days.
//
// Run with:
//   npm run digest:demo
//
// Run this AFTER you've run npm run scores:calculate at least once.

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

function seededRandom(seed) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

async function main() {
  console.log('Generating demo back-dated snapshot...\n')

  // Get most recent snapshot batch
  const { data: latest, error: latestErr } = await supabase
    .from('score_snapshots')
    .select('*')
    .order('snapshot_at', { ascending: false })
    .limit(120)
  if (latestErr) throw latestErr
  if (!latest || latest.length === 0) {
    console.error('No snapshots found. Run "npm run scores:calculate" first.')
    process.exit(1)
  }

  const latestTime = latest[0].snapshot_at
  const currentBatch = latest.filter((r) => r.snapshot_at === latestTime)
  console.log(`Found ${currentBatch.length} current scores at ${latestTime}`)

  // Back-date 3 days at noon
  const backDate = new Date()
  backDate.setDate(backDate.getDate() - 3)
  backDate.setHours(12, 0, 0, 0)

  // Generate "previous" scores as today ± a small random offset.
  // Using a seeded RNG so the same player always gets the same demo movement.
  const backDatedRows = currentBatch.map((row) => {
    const rng = seededRandom(row.player_id * 7919 + 13)
    const r = rng()
    let offset // how yesterday differs from today
    if (r < 0.25)
      offset = 0 // unchanged
    else if (r < 0.65)
      offset = -1 - Math.floor(rng() * 4) // -1 to -4 (player gained since)
    else offset = 1 + Math.floor(rng() * 4) // +1 to +4 (player lost since)

    return {
      player_id: row.player_id,
      season_id: row.season_id,
      live_score: Math.max(0, row.live_score + offset),
      cumulative_score: Math.max(0, row.cumulative_score + offset),
      trigger_event: 'demo_backdated',
      snapshot_at: backDate.toISOString(),
    }
  })

  // Remove any prior demo rows so re-running this is idempotent
  const { error: delErr } = await supabase
    .from('score_snapshots')
    .delete()
    .eq('trigger_event', 'demo_backdated')
  if (delErr) console.log(`(Clean-up note: ${delErr.message})`)

  const { error: insErr } = await supabase.from('score_snapshots').insert(backDatedRows)
  if (insErr) throw insErr

  const totalSwing = backDatedRows.reduce((sum, r) => {
    const cur = currentBatch.find((c) => c.player_id === r.player_id)
    return sum + Math.abs((cur?.live_score ?? 0) - r.live_score)
  }, 0)

  console.log(
    `\n✓ Inserted ${backDatedRows.length} demo rows back-dated to ${backDate.toLocaleString('en-GB')}`
  )
  console.log(`  Total simulated point swing: ${totalSwing}`)
  console.log('\nVisit http://localhost:3000/digest to see the page with content.')
  console.log('\nTo remove the demo data later, run:')
  console.log('  node --env-file=.env.local -e "import(\'@supabase/supabase-js\').then(m=>{const s=m.createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);return s.from(\'score_snapshots\').delete().eq(\'trigger_event\',\'demo_backdated\')}).then(()=>console.log(\'cleaned\'))"')
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

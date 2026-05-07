// Predicta Leagues — Map Sportmonks team IDs to our database teams.
// Run once after seeding the database. Updates the sportmonks_id column
// on each team in our `teams` table.
//
// Mapping verified against the live Premier League table (May 2026):
//   pos 1 (76pts) = Arsenal             → sportmonks id 19
//   pos 2 (71pts) = Manchester City     → 9
//   pos 3 (64pts) = Manchester United   → 14
//   pos 4 (58pts) = Liverpool           → 8
//   pos 5 (58pts) = Aston Villa         → 15
//   pos 6 (52pts) = Bournemouth         → 52
//   pos 7 (51pts) = Brentford           → 236
//   pos 8 (50pts) = Brighton & Hove A.  → 78
//   pos 9 (48pts) = Chelsea             → 18
//   pos 10 (48pts) = Everton            → 13
//   pos 11 (48pts) = Fulham             → 11
//   pos 12 (47pts) = Sunderland         → 3
//   pos 13 (45pts) = Newcastle United   → 20
//   pos 14 (43pts) = Leeds United       → 71
//   pos 15 (43pts) = Crystal Palace     → 51
//   pos 16 (42pts) = Nottingham Forest  → 63
//   pos 17 (37pts) = Tottenham Hotspur  → 6
//   pos 18 (36pts) = West Ham United    → 1
//   pos 19 (20pts) = Burnley            → 27
//   pos 20 (18pts) = Wolverhampton W.   → 29

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const TEAM_MAPPING = {
  Arsenal: 19,
  'Aston Villa': 15,
  Bournemouth: 52,
  Brentford: 236,
  'Brighton & Hove Albion': 78,
  Burnley: 27,
  Chelsea: 18,
  'Crystal Palace': 51,
  Everton: 13,
  Fulham: 11,
  'Leeds United': 71,
  Liverpool: 8,
  'Manchester City': 9,
  'Manchester United': 14,
  'Newcastle United': 20,
  'Nottingham Forest': 63,
  Sunderland: 3,
  'Tottenham Hotspur': 6,
  'West Ham United': 1,
  'Wolverhampton Wanderers': 29,
}

async function main() {
  console.log('Mapping Sportmonks team IDs to our teams table...\n')

  let updated = 0
  let missing = []

  for (const [name, sportmonksId] of Object.entries(TEAM_MAPPING)) {
    const { data, error } = await supabase
      .from('teams')
      .update({ sportmonks_id: sportmonksId })
      .eq('name', name)
      .select('id, name')
    if (error) {
      console.log(`  ✗ ${name}: ${error.message}`)
      continue
    }
    if (!data || data.length === 0) {
      missing.push(name)
      console.log(`  ✗ ${name}: not found in our DB`)
      continue
    }
    updated++
    console.log(`  ✓ ${name.padEnd(28)} sportmonks_id=${sportmonksId}`)
  }

  console.log(`\nUpdated ${updated} of 20 teams.`)
  if (missing.length > 0) {
    console.log(`Missing from our DB: ${missing.join(', ')}`)
  }

  // Verify by reading back
  const { data: verify } = await supabase
    .from('teams')
    .select('name, sportmonks_id')
    .order('name')
  const unmapped = verify.filter((t) => !t.sportmonks_id)
  if (unmapped.length === 0) {
    console.log('\n✓ All 20 teams now have a sportmonks_id.')
  } else {
    console.log(`\n⚠ ${unmapped.length} teams still missing a sportmonks_id:`)
    for (const t of unmapped) console.log(`     ${t.name}`)
  }
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})

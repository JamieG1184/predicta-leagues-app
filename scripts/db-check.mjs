import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

async function main() {
  console.log('Database row counts:\n')
  for (const table of [
    'seasons',
    'teams',
    'players',
    'predictions',
    'actual_standings',
    'score_snapshots',
    'fixtures',
  ]) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`  ${table}: ERROR — ${error.message}`)
    } else {
      console.log(`  ${table}: ${count ?? 0} rows`)
    }
  }

  console.log('\nAll seasons:')
  const { data: seasons } = await supabase.from('seasons').select('*')
  for (const s of seasons ?? []) {
    console.log(`  id=${s.id}  name="${s.name}"  is_current=${s.is_current}`)
  }
}

main()

import { getInPlayFixtures } from '@/src/lib/data'
import { LiveFixtureRow } from './LiveFixtureRow'

// Map the short period codes we store in the DB to friendlier display labels.
// We keep the codes themselves (1H / HT / 2H / FT) in the database and in any
// equality checks elsewhere; this function only touches what the user sees.
function formatPeriod(code: string | null | undefined): string {
  if (!code) return ''
  switch (code) {
    case '1H':
      return '1st half'
    case 'HT':
      return 'Half time'
    case '2H':
      return '2nd half'
    case 'FT':
      return 'Full time'
    case 'ET 1H':
      return 'Extra time · 1st half'
    case 'ET HT':
      return 'Extra time · half time'
    case 'ET 2H':
      return 'Extra time · 2nd half'
    case 'PEN':
      return 'Penalties'
    case 'STOPPAGE':
      return 'Stoppage time'
    default:
      return code
  }
}

export async function LiveFixturesStrip() {
  const fixtures = await getInPlayFixtures()
  if (fixtures.length === 0) return null

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Live now</span>
        <span>
          {fixtures.length} {fixtures.length === 1 ? 'match' : 'matches'} in play
        </span>
      </div>
      <div className="space-y-2">
        {fixtures.map((f) => (
          <LiveFixtureRow
            key={f.fixture_id}
            fixture_id={f.fixture_id}
            home_team_name={f.home_team_name}
            away_team_name={f.away_team_name}
            live_home_score={f.live_home_score}
            live_away_score={f.live_away_score}
            period_label={formatPeriod(f.live_period)}
          />
        ))}
      </div>
    </section>
  )
}

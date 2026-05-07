import { getInPlayFixtures } from '@/src/lib/data'
import { TeamBadge } from './TeamBadge'

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
        {fixtures.map((f) => {
          const hasScore = f.live_home_score != null && f.live_away_score != null
          return (
            <div
              key={f.fixture_id}
              className="flex items-center gap-3 rounded-xl border-2 border-emerald-400 bg-white p-3 text-sm dark:border-emerald-500/60 dark:bg-zinc-900"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <span className="relative h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                {f.live_period}
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <TeamBadge teamName={f.home_team_name} size={20} />
                <span className="truncate font-medium">{f.home_team_name}</span>
              </div>
              {hasScore ? (
                <span className="shrink-0 px-2 text-base font-bold tabular-nums">
                  {f.live_home_score} – {f.live_away_score}
                </span>
              ) : (
                <span className="shrink-0 px-2 text-xs uppercase tracking-wider text-zinc-500">
                  vs
                </span>
              )}
              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <span className="truncate text-right font-medium">{f.away_team_name}</span>
                <TeamBadge teamName={f.away_team_name} size={20} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

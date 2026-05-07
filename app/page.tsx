import Link from 'next/link'
import { getLeaderboard, getLeagueInsights } from '@/src/lib/data'
import { LivePoller } from './_components/LivePoller'
import { LiveFixturesStrip } from './_components/LiveFixturesStrip'
import { WeeklyBadgesPanel } from './_components/WeeklyBadgesPanel'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const [rows, insights] = await Promise.all([getLeaderboard(), getLeagueInsights()])

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-10 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <div className="flex items-start gap-4">
          <img
            src="/predicta-logo.svg"
            alt="Predicta Leagues"
            width={84}
            height={84}
            className="shrink-0"
          />
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Premier League · 2025/26
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Predicta Leagues
            </h1>
          </div>
        </div>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          The live leaderboard from your community&apos;s 2025/26 season. Scores
          are recalculated against the actual Premier League table; the final
          score after the season&apos;s last fixture decides the winner.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href="/digest"
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
          >
            View round analysis →
          </Link>
          <Link
            href="/feedback"
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Send feedback
          </Link>
          <LivePoller />
        </div>
      </header>

      <LiveFixturesStrip />

      <WeeklyBadgesPanel />

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>League insights</span>
          <span>This season</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InsightCard
            label="Best Joker call"
            primary={
              insights.highest_joker
                ? `${insights.highest_joker.player_name}`
                : '—'
            }
            sub={
              insights.highest_joker
                ? `${insights.highest_joker.team_name} · ${insights.highest_joker.points} pts`
                : undefined
            }
            accent
          />
          <InsightCard
            label="Most popular title pick"
            primary={insights.most_popular_title_pick.team_name}
            sub={
              insights.most_popular_title_pick.count > 0
                ? `${insights.most_popular_title_pick.count}/${insights.player_count} players · finishing ${insights.most_popular_title_pick.actual_position ?? '—'}`
                : undefined
            }
          />
          <InsightCard
            label="Most popular relegation"
            primary={insights.most_popular_relegation_pick.team_name}
            sub={
              insights.most_popular_relegation_pick.count > 0
                ? `${insights.most_popular_relegation_pick.count}/${insights.player_count} players · currently ${insights.most_popular_relegation_pick.actual_position ?? '—'}`
                : undefined
            }
          />
          <InsightCard
            label="League stats"
            primary={`${insights.total_exact_hits} exact hits`}
            sub={`Avg score ${insights.league_average_score} pts`}
          />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Standings</span>
          <span>{rows.length} players</span>
        </div>
        <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {rows.map((row, i) => (
            <li
              key={row.player.id}
              className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800"
            >
              <span
                className={
                  i < 3
                    ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                }
              >
                {row.rank}
              </span>
              <Link
                href={`/p/${row.player.invite_code}`}
                className="min-w-0 flex-1 group"
              >
                <div className="flex items-baseline gap-2">
                  <span className="truncate font-medium group-hover:underline">
                    {row.player.display_name}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500 dark:text-zinc-500">
                  <span>
                    Joker:{' '}
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {row.joker_team_name ?? '—'}
                    </span>{' '}
                    <span
                      className={
                        row.joker_points > 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-zinc-400 dark:text-zinc-600'
                      }
                    >
                      ({row.joker_points} pts)
                    </span>
                  </span>
                  <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  <span>
                    Exact hits:{' '}
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {row.exact_hits}
                    </span>
                  </span>
                </div>
              </Link>
              <span className="ml-auto shrink-0 text-right">
                <span className="block text-xl font-semibold tabular-nums">
                  {row.total}
                </span>
                <span className="block text-xs uppercase tracking-wide text-zinc-500">
                  pts
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-10 text-xs text-zinc-500 dark:text-zinc-500">
        <p>
          The displayed score is the live snapshot of each player&apos;s
          prediction against the current Premier League table. Every player
          gets their own private link — tap any name above for the team-by-team
          breakdown.
        </p>
      </footer>
    </main>
  )
}

function InsightCard({
  label,
  primary,
  sub,
  accent = false,
}: {
  label: string
  primary: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={
          accent
            ? 'mt-1 text-base font-semibold leading-tight text-emerald-700 dark:text-emerald-400'
            : 'mt-1 text-base font-semibold leading-tight'
        }
      >
        {primary}
      </div>
      {sub && (
        <div className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-500">
          {sub}
        </div>
      )}
    </div>
  )
}

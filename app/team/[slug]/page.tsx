import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTeamDetail } from '@/src/lib/data'
import { TeamBadge } from '../../_components/TeamBadge'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

export default async function TeamPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const detail = await getTeamDetail(slug)
  if (!detail) notFound()

  // Find max count for histogram bar scaling
  const maxCount = Math.max(...detail.distribution.map((d) => d.count), 1)

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <Link
        href="/"
        className="mb-6 inline-flex items-center text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
      >
        ← League
      </Link>

      <header className="mb-10 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Premier League · 2025/26
        </p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          <TeamBadge teamName={detail.team.name} size={40} />
          {detail.team.name}
        </h1>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label="Actual position"
            value={detail.actual_position != null ? `#${detail.actual_position}` : '—'}
            sub={detail.actual_points != null ? `${detail.actual_points} pts` : undefined}
            accent
          />
          <Stat
            label="Average predicted"
            value={
              detail.average_predicted_position != null
                ? `#${detail.average_predicted_position}`
                : '—'
            }
          />
          <Stat
            label="Most popular pick"
            value={
              detail.most_popular_predicted_position != null
                ? `#${detail.most_popular_predicted_position}`
                : '—'
            }
          />
          <Stat
            label="Picked as Joker"
            value={`${detail.joker_count} / ${detail.prediction_count}`}
          />
        </div>
      </header>

      <section className="mb-12">
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>How the league predicted {detail.team.name}</span>
          <span>By position</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-end gap-1.5 h-44 px-2">
            {detail.distribution.map((d) => {
              const isActual = detail.actual_position === d.position
              const heightPct = (d.count / maxCount) * 100
              return (
                <div
                  key={d.position}
                  className="group flex-1 h-full flex flex-col justify-end items-center relative"
                  title={`${d.count} players predicted position ${d.position}`}
                >
                  {d.count > 0 && (
                    <span className="text-[10px] mb-1 text-zinc-500 tabular-nums">
                      {d.count}
                    </span>
                  )}
                  <div
                    className={
                      isActual
                        ? 'w-full rounded-t bg-emerald-600 dark:bg-emerald-500'
                        : 'w-full rounded-t bg-zinc-300 dark:bg-zinc-700'
                    }
                    style={{
                      height: d.count === 0 ? '2px' : `${heightPct}%`,
                      minHeight: d.count === 0 ? '2px' : '4px',
                    }}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex gap-1.5 px-2">
            {detail.distribution.map((d) => (
              <div
                key={d.position}
                className={
                  detail.actual_position === d.position
                    ? 'flex-1 text-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums'
                    : 'flex-1 text-center text-[10px] text-zinc-500 tabular-nums'
                }
              >
                {d.position}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
            Green bar marks {detail.team.name}&apos;s actual position. Numbers above each bar = how many players predicted that position.
          </p>
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Every player&apos;s pick</span>
          <span>{detail.prediction_count} predictions</span>
        </div>
        <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {detail.player_picks.map((pick) => (
            <li
              key={pick.invite_code}
              className={
                pick.is_joker
                  ? 'flex items-center gap-3 border-b border-zinc-100 bg-amber-50/60 px-3 py-2 last:border-0 dark:border-zinc-800 dark:bg-amber-500/5'
                  : 'flex items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-800'
              }
            >
              <span className="w-7 text-right tabular-nums text-zinc-500">
                {pick.predicted_position}
              </span>
              <TeamBadge teamName={detail.team.name} size={16} />
              <Link
                href={`/p/${pick.invite_code}`}
                className="flex-1 truncate hover:underline"
              >
                {pick.player_name}
              </Link>
              {pick.is_joker && (
                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  Joker
                </span>
              )}
              <span className="w-12 text-right text-xs text-zinc-500 tabular-nums">
                {pick.distance == null
                  ? '—'
                  : pick.distance === 0
                  ? '✓'
                  : `±${pick.distance}`}
              </span>
              <span
                className={
                  pick.points > 0
                    ? 'w-12 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400'
                    : 'w-12 text-right tabular-nums text-zinc-400 dark:text-zinc-600'
                }
              >
                {pick.points}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}

function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={
          accent
            ? 'mt-1 text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400'
            : 'mt-1 text-lg font-semibold tabular-nums'
        }
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">{sub}</div>
      )}
    </div>
  )
}

import Link from 'next/link'
import { getLatestWeekBadges, BADGE_LABELS, type BadgeType } from '@/src/lib/data'

const BADGE_ORDER: BadgeType[] = [
  'top_of_league',
  'highest_weekly_score',
  'highest_climber',
  'biggest_drop',
  'lowest_weekly_score',
  'bottom_of_league',
]

export async function WeeklyBadgesPanel() {
  const badges = await getLatestWeekBadges()
  if (badges.length === 0) return null

  const weekLabel = badges[0]?.week_label ?? 'Last week'
  const byType = new Map(badges.map((b) => [b.badge_type, b]))

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Last week's awards</span>
        <span>{weekLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {BADGE_ORDER.map((type) => {
          const b = byType.get(type)
          const meta = BADGE_LABELS[type]
          if (!b) return null
          return (
            <Link
              key={type}
              href={`/p/${b.invite_code}`}
              className={
                meta.tone === 'good'
                  ? 'rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 hover:bg-emerald-50 dark:border-emerald-700/40 dark:bg-emerald-500/5 dark:hover:bg-emerald-500/10'
                  : 'rounded-lg border border-rose-200 bg-rose-50/60 p-3 hover:bg-rose-50 dark:border-rose-700/40 dark:bg-rose-500/5 dark:hover:bg-rose-500/10'
              }
            >
              <div className="flex items-baseline gap-2">
                <span className="text-base">{meta.emoji}</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                  {meta.label}
                </span>
              </div>
              <div className="mt-1 text-sm font-semibold leading-tight">
                {b.player_name}
              </div>
              {b.notes && (
                <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-500">{b.notes}</div>
              )}
            </Link>
          )
        })}
      </div>
    </section>
  )
}

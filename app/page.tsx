import Link from 'next/link'
import {
  getLeaderboard,
  getDailyScoreInsights,
  getLastScoreUpdateTime,
} from '@/src/lib/data'
import { LivePoller } from './_components/LivePoller'
import { LiveFixturesStrip } from './_components/LiveFixturesStrip'
import { WeeklyBadgesPanel } from './_components/WeeklyBadgesPanel'
import { StandingsList } from './_components/StandingsList'

export const dynamic = 'force-dynamic'

function formatDeltaSigned(n: number): string {
  if (n > 0) return `+${n}`
  return `${n}`
}

function formatShortDate(yyyymmdd: string): string {
  // Input is YYYY-MM-DD. Output e.g. "12 Apr".
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  if (!y || !m || !d) return yyyymmdd
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatDateTime(iso: string | null): string | null {
  // Output e.g. "8 May, 14:23". Locked to UK time because the page renders
  // server-side on Vercel (UTC) but our players are all in the UK.
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const datePart = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/London',
  })
  const timePart = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/London',
  })
  return `${datePart}, ${timePart}`
}

export default async function LeaderboardPage() {
  const [rows, daily, lastUpdate] = await Promise.all([
    getLeaderboard(),
    getDailyScoreInsights(),
    getLastScoreUpdateTime(),
  ])
  const lastUpdateLabel = formatDateTime(lastUpdate)

  // "Highest climber" / "Biggest drop" come straight from the leaderboard's
  // rank_change field (vs the most recent prior snapshot).
  const climber =
    rows
      .filter((r) => r.rank_change != null && r.rank_change > 0)
      .sort((a, b) => (b.rank_change ?? 0) - (a.rank_change ?? 0))[0] ?? null
  const dropper =
    rows
      .filter((r) => r.rank_change != null && r.rank_change < 0)
      .sort((a, b) => (a.rank_change ?? 0) - (b.rank_change ?? 0))[0] ?? null

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
          <span>Latest movements</span>
          <span>
            {lastUpdateLabel
              ? `Since last fixture · ${lastUpdateLabel}`
              : 'Since last fixture'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MovementCard
            label="Highest climber"
            tone="climb"
            playerName={climber?.player.display_name ?? null}
            inviteCode={climber?.player.invite_code ?? null}
            positions={climber?.rank_change ?? null}
            points={climber?.score_change ?? null}
          />
          <MovementCard
            label="Biggest drop"
            tone="drop"
            playerName={dropper?.player.display_name ?? null}
            inviteCode={dropper?.player.invite_code ?? null}
            positions={
              dropper?.rank_change != null
                ? Math.abs(dropper.rank_change)
                : null
            }
            points={dropper?.score_change ?? null}
          />
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Daily scoring</span>
          <span>
            {daily.scoring_days > 0
              ? `${daily.scoring_days} scoring ${daily.scoring_days === 1 ? 'day' : 'days'}`
              : 'No data yet'}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <InsightCard
            label="Most consistent"
            primary={
              daily.highest_mean_player
                ? daily.highest_mean_player.name
                : '—'
            }
            sub={
              daily.highest_mean_player
                ? `${formatDeltaSigned(daily.highest_mean_player.mean_per_day)} pts/day · league avg ${formatDeltaSigned(daily.league_avg_per_day)}`
                : 'Need at least two scoring days.'
            }
            accent
          />
          <InsightCard
            label="Best day"
            primary={
              daily.highest_single_day
                ? daily.highest_single_day.player_name
                : '—'
            }
            sub={
              daily.highest_single_day
                ? `${formatDeltaSigned(daily.highest_single_day.delta)} pts on ${formatShortDate(daily.highest_single_day.date)}`
                : undefined
            }
          />
          <InsightCard
            label="Worst day"
            primary={
              daily.lowest_single_day
                ? daily.lowest_single_day.player_name
                : '—'
            }
            sub={
              daily.lowest_single_day
                ? `${formatDeltaSigned(daily.lowest_single_day.delta)} pts on ${formatShortDate(daily.lowest_single_day.date)}`
                : undefined
            }
          />
        </div>
      </section>

      <StandingsList initialRows={rows} lastUpdateLabel={lastUpdateLabel} />

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

function MovementCard({
  label,
  tone,
  playerName,
  inviteCode,
  positions,
  points,
}: {
  label: string
  tone: 'climb' | 'drop'
  playerName: string | null
  inviteCode: string | null
  positions: number | null
  points: number | null
}) {
  const isClimb = tone === 'climb'
  const arrow = isClimb ? '▲' : '▼'
  const positionsLabel = isClimb ? 'positions gained' : 'positions dropped'

  const containerClass = isClimb
    ? 'rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-500/5'
    : 'rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900/40 dark:bg-rose-500/5'

  const labelClass = isClimb
    ? 'text-[10px] font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400'
    : 'text-[10px] font-medium uppercase tracking-widest text-rose-700 dark:text-rose-400'

  const numberClass = isClimb
    ? 'text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400'
    : 'text-3xl font-bold tabular-nums text-rose-700 dark:text-rose-400'

  const pointsClass = isClimb
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-rose-700 dark:text-rose-400'

  if (positions == null || playerName == null) {
    return (
      <div className={containerClass}>
        <div className={labelClass}>{label}</div>
        <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No movement to show yet.
        </div>
      </div>
    )
  }

  // points can be 0 or negative for a climber (rare edge case where player
  // climbed because others fell harder). We display whatever score_change is.
  const pointsText =
    points == null
      ? null
      : `${points > 0 ? '+' : ''}${points} pts`

  return (
    <div className={containerClass}>
      <div className={labelClass}>{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={numberClass}>
          {arrow} {positions}
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {positionsLabel}
        </span>
      </div>
      {pointsText && (
        <div className="mt-0.5 text-sm font-semibold tabular-nums">
          <span className={pointsClass}>{pointsText}</span>
        </div>
      )}
      {inviteCode ? (
        <Link
          href={`/p/${inviteCode}`}
          className="mt-1 block text-sm font-medium hover:underline"
        >
          {playerName}
        </Link>
      ) : (
        <div className="mt-1 text-sm font-medium">{playerName}</div>
      )}
    </div>
  )
}

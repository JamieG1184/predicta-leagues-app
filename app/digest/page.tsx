import Link from 'next/link'
import { getDailyDigest, type DigestMovement, type DigestFixture } from '@/src/lib/data'
import { slugifyTeam } from '@/src/lib/slugify'
import { TeamBadge } from '../_components/TeamBadge'
import { LiveFixturesStrip } from '../_components/LiveFixturesStrip'

export const dynamic = 'force-dynamic'

export default async function DigestPage() {
  const digest = await getDailyDigest()

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
          Period Analysis · 2025/26
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Round summary
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          A quantitative review of the most recent fixtures and their impact on
          the league standings. Updated each time the scoring engine runs.
        </p>
      </header>

      <LiveFixturesStrip />

      {!digest.has_data ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="font-medium">No digest available yet.</p>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">{digest.reason}</p>
        </div>
      ) : (
        <DigestBody digest={digest} />
      )}
    </main>
  )
}

function DigestBody({
  digest,
}: {
  digest: Extract<Awaited<ReturnType<typeof getDailyDigest>>, { has_data: true }>
}) {
  const periodStart = new Date(digest.period_start)
  const periodEnd = new Date(digest.period_end)
  const periodLabel = `${periodStart.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })} → ${periodEnd.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`

  return (
    <>
      <section className="mb-10">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-relaxed text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-500/10 dark:text-emerald-100">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Analysis
          </p>
          <div className="mt-2 space-y-2.5">
            {digest.narrative_segments.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-emerald-800/70 dark:text-emerald-300/60">
            Period: {periodLabel} · {digest.hours_between}h elapsed
          </p>
        </div>
      </section>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Period metrics</span>
          <span>Key indicators</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="Fixtures played"
            value={String(digest.fixtures_played.length)}
            sub={digest.fixtures_played.length === 0 ? 'No matches' : undefined}
          />
          <Kpi
            label="Aggregate point change"
            value={`${digest.total_points_changed} pts`}
            sub={`${digest.movements.filter((m) => m.score_change !== 0).length} of ${digest.movements.length} players affected`}
          />
          <Kpi
            label="Mean score"
            value={String(digest.avg_score_now)}
            sub={
              digest.avg_score_now > digest.avg_score_then
                ? `▲ ${(digest.avg_score_now - digest.avg_score_then).toFixed(1)} vs prior`
                : digest.avg_score_now < digest.avg_score_then
                ? `▼ ${(digest.avg_score_then - digest.avg_score_now).toFixed(1)} vs prior`
                : 'Unchanged'
            }
          />
          <Kpi
            label="League leader"
            value={digest.league_leader?.player_name ?? '—'}
            sub={
              digest.league_leader
                ? `${digest.league_leader.score_after} pts`
                : undefined
            }
            accent
          />
        </div>
      </section>

      {(digest.biggest_gainer || digest.biggest_loser) && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
            <span>Period extremes</span>
            <span>Largest gains and declines</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {digest.biggest_gainer && (
              <MoverCard movement={digest.biggest_gainer} kind="gainer" />
            )}
            {digest.biggest_loser && (
              <MoverCard movement={digest.biggest_loser} kind="loser" />
            )}
          </div>
        </section>
      )}

      {digest.fixtures_played.length > 0 && (
        <section className="mb-10">
          <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
            <span>Match results & impact</span>
            <span>{digest.fixtures_played.length} fixtures</span>
          </div>
          <div className="space-y-3">
            {digest.fixtures_played.map((f, i) => (
              <FixtureResultCard key={i} fixture={f} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Standings update</span>
          <span>Position changes</span>
        </div>
        <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {digest.movements.map((m) => (
            <li
              key={m.player_id}
              className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5 last:border-0 dark:border-zinc-800"
            >
              <span className="w-7 text-right tabular-nums text-zinc-500">
                {m.rank_after}
              </span>
              <RankChange change={m.rank_change} />
              <Link
                href={`/p/${m.invite_code}`}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {m.player_name}
              </Link>
              <span className="text-xs text-zinc-500 tabular-nums">
                {m.score_change === 0 ? (
                  '·'
                ) : (
                  <span
                    className={
                      m.score_change > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }
                  >
                    {m.score_change > 0 ? '+' : ''}
                    {m.score_change}
                  </span>
                )}
              </span>
              <span className="w-10 text-right font-semibold tabular-nums">{m.score_after}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        To refresh after the next round of fixtures, run{' '}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] dark:bg-zinc-800">
          npm run digest:snapshot
        </code>{' '}
        from your terminal. The page will then compare that fresh snapshot to the
        previous one.
      </p>
    </>
  )
}

function FixtureResultCard({ fixture }: { fixture: DigestFixture }) {
  const date = new Date(fixture.starting_at)
  const dateStr = date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const winnerLabel =
    fixture.winner === 'home'
      ? `${fixture.home_team_name ?? 'Home'} win`
      : fixture.winner === 'away'
      ? `${fixture.away_team_name ?? 'Away'} win`
      : fixture.winner === 'draw'
      ? 'Draw'
      : 'Result pending'

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{dateStr}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {winnerLabel}
        </span>
      </div>
      <h3 className="flex flex-wrap items-center gap-1.5 text-base font-semibold leading-tight">
        {fixture.home_team_name ? (
          <Link
            href={`/team/${slugifyTeam(fixture.home_team_name)}`}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <TeamBadge teamName={fixture.home_team_name} size={20} />
            {fixture.home_team_name}
          </Link>
        ) : (
          'Home'
        )}
        <span className="text-zinc-400">vs</span>
        {fixture.away_team_name ? (
          <Link
            href={`/team/${slugifyTeam(fixture.away_team_name)}`}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <TeamBadge teamName={fixture.away_team_name} size={20} />
            {fixture.away_team_name}
          </Link>
        ) : (
          'Away'
        )}
      </h3>
      {fixture.result_info && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">{fixture.result_info}</p>
      )}
      {fixture.analysis && (
        <p className="mt-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {fixture.analysis}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-500 dark:text-zinc-500">
        <FixtureSideStat
          label={fixture.home_team_name ?? 'Home'}
          actual={fixture.home_actual_position}
          mean={fixture.home_predicted_mean}
          joker={fixture.home_joker_count}
        />
        <FixtureSideStat
          label={fixture.away_team_name ?? 'Away'}
          actual={fixture.away_actual_position}
          mean={fixture.away_predicted_mean}
          joker={fixture.away_joker_count}
        />
      </div>
    </div>
  )
}

function FixtureSideStat({
  label,
  actual,
  mean,
  joker,
}: {
  label: string
  actual: number | null
  mean: number | null
  joker: number
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 tabular-nums">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Actual</div>
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{actual ?? '—'}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Mean pick</div>
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{mean ?? '—'}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-zinc-500">Jokers</div>
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{joker}</div>
        </div>
      </div>
    </div>
  )
}

function MoverCard({
  movement,
  kind,
}: {
  movement: DigestMovement
  kind: 'gainer' | 'loser'
}) {
  return (
    <div
      className={
        kind === 'gainer'
          ? 'rounded-xl border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-700/50 dark:bg-emerald-500/10'
          : 'rounded-xl border border-rose-300 bg-rose-50 p-4 dark:border-rose-700/50 dark:bg-rose-500/10'
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest">
        {kind === 'gainer' ? 'Largest gain' : 'Largest decline'}
      </div>
      <Link
        href={`/p/${movement.invite_code}`}
        className="mt-1 block text-lg font-semibold leading-tight hover:underline"
      >
        {movement.player_name}
      </Link>
      <div className="mt-1 text-sm">
        <span
          className={
            movement.score_change > 0
              ? 'font-semibold text-emerald-700 dark:text-emerald-400'
              : 'font-semibold text-rose-700 dark:text-rose-400'
          }
        >
          {movement.score_change > 0 ? '+' : ''}
          {movement.score_change} pts
        </span>{' '}
        · #{movement.rank_before ?? '—'} → #{movement.rank_after}
      </div>
      {movement.joker_team_name && (
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Joker: {movement.joker_team_name}
        </div>
      )}
    </div>
  )
}

function RankChange({ change }: { change: number }) {
  if (change === 0) {
    return <span className="w-7 text-center text-xs text-zinc-400">·</span>
  }
  if (change > 0) {
    return (
      <span className="w-7 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
        ▲ {change}
      </span>
    )
  }
  return (
    <span className="w-7 text-center text-xs font-medium text-rose-700 dark:text-rose-400 tabular-nums">
      ▼ {Math.abs(change)}
    </span>
  )
}

function Kpi({
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
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={
          accent
            ? 'mt-1 text-base font-semibold text-emerald-700 dark:text-emerald-400'
            : 'mt-1 text-base font-semibold tabular-nums'
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

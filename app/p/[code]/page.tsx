import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getPlayerDetail,
  getLeaderboard,
  getPlayerUpcomingFixtures,
  getPlayerMovement,
  getScenarioData,
  getPlayerBadges,
  getAdminPlayerDetail,
  getOriginalPredictionByName,
  BADGE_LABELS,
  type PlayerMovement,
  type PreviousFixture,
  type WeeklyBadge,
  type OriginalPrediction,
} from '@/src/lib/data'
import { CompareSelector } from '../../compare/CompareSelector'
import { TeamBadge } from '../../_components/TeamBadge'
import { LivePoller } from '../../_components/LivePoller'
import { PlayerTabs } from './PlayerTabs'

export const dynamic = 'force-dynamic'

type Params = { code: string }

export default async function PlayerPage({ params }: { params: Promise<Params> }) {
  const { code } = await params
  const [detail, board, lookAhead, movement, scenario] = await Promise.all([
    getPlayerDetail(code),
    getLeaderboard(),
    getPlayerUpcomingFixtures(code, 30),
    getPlayerMovement(code),
    getScenarioData(code),
  ])
  if (!detail) notFound()
  const badges = await getPlayerBadges(detail.player.id)
  const adminDetail = await getAdminPlayerDetail(code)
  const originalPredictions = getOriginalPredictionByName(detail.player.display_name)
  const shiftInfo = adminDetail?.shift ?? null
  const allPlayers = board.map((r) => ({
    display_name: r.player.display_name,
    invite_code: r.player.invite_code,
  }))
  const fixtures = lookAhead?.fixtures ?? []

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/"
          className="inline-flex items-center text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
        >
          ← League
        </Link>
        <LivePoller />
      </div>

      <header className="mb-8 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Predicta Leagues · {detail.season_name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {detail.player.display_name}
        </h1>

        {(() => {
          const teamsScoring = detail.scored.filter((s) => s.points > 0).length
          const teamsScoringPct = Math.round((teamsScoring / 20) * 100)
          return (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Rank" value={`#${detail.rank}`} />
              <Stat label="Live score" value={String(detail.total)} accent />
              <Stat
                label="Teams scoring"
                value={`${teamsScoring} / 20`}
                sub={`${teamsScoringPct}%`}
              />
              <Stat
                label="Joker"
                value={detail.joker_team_name ?? '—'}
                sub={`${detail.joker_points} pts`}
              />
            </div>
          )
        })()}

        <div className="mt-4 max-w-xs">
          <CompareSelector fromCode={detail.player.invite_code} players={allPlayers} />
        </div>
      </header>

      {movement.has_data && <RecentActivity movement={movement} />}

      {badges.length > 0 && <BadgesSection badges={badges} />}

      <PlayerTabs
        scored={detail.scored}
        total={detail.total}
        fixtures={fixtures}
        current_table={detail.current_table}
        fixturesAvailable={fixtures.length > 0}
        scenario_player_id={detail.player.id}
        scenario_fixtures={scenario?.fixtures ?? []}
        scenario_standings={scenario?.current_standings ?? []}
        scenario_players={scenario?.all_players ?? []}
        original_predictions={originalPredictions}
        shift_info={
          shiftInfo
            ? {
                team_name: shiftInfo.team_name,
                old_position: shiftInfo.old_position,
                new_position: shiftInfo.new_position,
              }
            : null
        }
      />

      <footer className="mt-10 text-xs text-zinc-500 dark:text-zinc-500">
        <p>
          Scoring rule: 5 points for an exact-position prediction, 3 for ±1, 1
          for ±2, 0 for anything further. Your Joker team scores double in
          every category. The final score after the last gameweek of the
          season decides the winner.
        </p>
      </footer>
    </main>
  )
}

function BadgesSection({ badges }: { badges: WeeklyBadge[] }) {
  // Group by week_ending so each row represents one award week
  const byWeek = new Map<string, WeeklyBadge[]>()
  for (const b of badges) {
    if (!byWeek.has(b.week_ending)) byWeek.set(b.week_ending, [])
    byWeek.get(b.week_ending)!.push(b)
  }
  const weeks = [...byWeek.keys()].sort().reverse()

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Badges this season</span>
        <span>{badges.length} awarded</span>
      </div>
      <div className="space-y-3">
        {weeks.map((week) => {
          const weekBadges = byWeek.get(week)!
          const label = weekBadges[0]?.week_label ?? week
          return (
            <div
              key={week}
              className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {label}
              </div>
              <div className="flex flex-wrap gap-2">
                {weekBadges.map((b) => {
                  const meta = BADGE_LABELS[b.badge_type]
                  return (
                    <span
                      key={b.id}
                      title={b.notes ?? undefined}
                      className={
                        meta.tone === 'good'
                          ? 'inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:border-emerald-700/40 dark:bg-emerald-500/10 dark:text-emerald-200'
                          : 'inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-800 dark:border-rose-700/40 dark:bg-rose-500/10 dark:text-rose-200'
                      }
                    >
                      <span>{meta.emoji}</span>
                      <span>{meta.label}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RecentActivity({ movement }: { movement: PlayerMovement }) {
  const periodHours = movement.hours_between
  const periodLabel =
    periodHours < 36
      ? `last ${Math.round(periodHours)}h`
      : `last ${Math.round(periodHours / 24)} days`

  const scoreClass =
    movement.score_change > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : movement.score_change < 0
      ? 'text-rose-700 dark:text-rose-400'
      : 'text-zinc-500'
  const rankClass =
    movement.rank_change > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : movement.rank_change < 0
      ? 'text-rose-700 dark:text-rose-400'
      : 'text-zinc-500'

  return (
    <section className="mb-8">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-relaxed text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-500/10 dark:text-emerald-100">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Recent activity
          </p>
          <span className="text-[10px] uppercase tracking-widest text-emerald-700/70 dark:text-emerald-300/60">
            {periodLabel}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-700/70 dark:text-emerald-300/70">
              Score change
            </div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${scoreClass}`}>
              {movement.score_change === 0
                ? 'No change'
                : movement.score_change > 0
                ? `▲ ${movement.score_change}`
                : `▼ ${Math.abs(movement.score_change)}`}
            </div>
            <div className="text-xs text-emerald-800/70 dark:text-emerald-300/60">
              {movement.score_before ?? '—'} → {movement.score_after}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-700/70 dark:text-emerald-300/70">
              Rank change
            </div>
            <div className={`mt-1 text-lg font-semibold tabular-nums ${rankClass}`}>
              {movement.rank_change === 0
                ? 'Held'
                : movement.rank_change > 0
                ? `▲ ${movement.rank_change}`
                : `▼ ${Math.abs(movement.rank_change)}`}
            </div>
            <div className="text-xs text-emerald-800/70 dark:text-emerald-300/60">
              #{movement.rank_before ?? '—'} → #{movement.rank_after}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-700/70 dark:text-emerald-300/70">
              Result-needed accuracy
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {movement.success_rate == null
                ? '—'
                : `${Math.round(movement.success_rate * 100)}%`}
            </div>
            <div className="text-xs text-emerald-800/70 dark:text-emerald-300/60">
              {movement.success_count} / {movement.evaluable_count} fixtures
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-700/70 dark:text-emerald-300/70">
              Joker
            </div>
            <div className="mt-1 text-lg font-semibold leading-tight">
              {movement.joker_team_name ?? '—'}
            </div>
          </div>
        </div>

        {movement.narrative.length > 0 && (
          <div className="mt-4 space-y-1.5 text-sm leading-relaxed">
            {movement.narrative.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </div>
        )}

      </div>

      {movement.previous_fixtures.length > 0 && (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-700 dark:text-zinc-300">
              Previous fixtures
            </p>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              {movement.previous_fixtures.length}{' '}
              {movement.previous_fixtures.length === 1 ? 'match' : 'matches'}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
            For each match in this period: the result you needed to improve your
            score, against the result that actually occurred.
          </p>
          <ul className="mt-4 space-y-3">
            {movement.previous_fixtures.map((f, i) => (
              <PreviousFixtureCard key={i} fixture={f} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function PreviousFixtureCard({ fixture }: { fixture: PreviousFixture }) {
  const date = new Date(fixture.starting_at)
  const dateStr = date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const actualLabel =
    fixture.actual_winner === 'home'
      ? `${fixture.home_team_name ?? 'Home'} won`
      : fixture.actual_winner === 'away'
      ? `${fixture.away_team_name ?? 'Away'} won`
      : fixture.actual_winner === 'draw'
      ? 'Draw'
      : 'Result pending'

  const correct = fixture.outcome_correct
  return (
    <li
      className={
        correct === true
          ? 'rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-700/50 dark:bg-emerald-500/5'
          : correct === false
          ? 'rounded-lg border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-700/50 dark:bg-rose-500/5'
          : 'rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900'
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 font-medium leading-tight">
          {fixture.home_team_name && (
            <TeamBadge teamName={fixture.home_team_name} size={16} />
          )}
          {fixture.fixture_name}
          {fixture.away_team_name && (
            <TeamBadge teamName={fixture.away_team_name} size={16} />
          )}
          {fixture.joker_in_match && (
            <span className="ml-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              Joker
            </span>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-500">{dateStr}</span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Result you needed
          </div>
          <div className="mt-0.5 font-semibold">{fixture.needed_outcome_label}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">
            Actual result
          </div>
          <div
            className={
              correct === true
                ? 'mt-0.5 font-semibold text-emerald-700 dark:text-emerald-400'
                : correct === false
                ? 'mt-0.5 font-semibold text-rose-700 dark:text-rose-400'
                : 'mt-0.5 font-semibold'
            }
          >
            {actualLabel}{' '}
            {correct === true ? '✓' : correct === false ? '✗' : ''}
          </div>
        </div>
      </div>

      <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">
        Estimated score impact:{' '}
        {fixture.delta_actual === 0 ? (
          <span className="font-semibold">No change</span>
        ) : fixture.delta_actual > 0 ? (
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
            ▲ {fixture.delta_actual}
          </span>
        ) : (
          <span className="font-semibold text-rose-700 dark:text-rose-400">
            ▼ {Math.abs(fixture.delta_actual)}
          </span>
        )}{' '}
        · {fixture.home_team_name} predicted #{fixture.home_predicted_position} (currently #
        {fixture.home_actual_position ?? '—'}); {fixture.away_team_name} predicted #
        {fixture.away_predicted_position} (currently #
        {fixture.away_actual_position ?? '—'}).
      </div>
    </li>
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
        <div className="mt-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          {sub}
        </div>
      )}
    </div>
  )
}

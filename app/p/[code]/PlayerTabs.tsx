'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { ScoredPrediction } from '@/src/lib/scoring'
import type {
  FixtureLookAhead,
  FixtureSide,
  OriginalPrediction,
} from '@/src/lib/data'
import type {
  ScenarioFixture,
  ScenarioStanding,
  ScenarioPlayer,
} from '@/src/lib/scenario'
import { slugifyTeam } from '@/src/lib/slugify'
import { TeamBadge } from '../../_components/TeamBadge'
import { ScenarioBuilder } from './ScenarioBuilder'

// Map the short period codes we store in the DB to friendlier display labels.
// Kept in sync with the matching helper in LiveFixturesStrip.tsx — codes
// themselves still drive the equality checks (live_period !== 'FT' etc.).
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

type Tab = 'prediction' | 'original' | 'fixtures' | 'pl_table' | 'scenario'

type Props = {
  scored: ScoredPrediction[]
  total: number
  fixtures: FixtureLookAhead[]
  current_table: { position: number; team_name: string; points: number }[]
  fixturesAvailable: boolean
  scenario_player_id: number
  scenario_fixtures: ScenarioFixture[]
  scenario_standings: ScenarioStanding[]
  scenario_players: ScenarioPlayer[]
  original_predictions: OriginalPrediction[] | null
  shift_info: {
    team_name: string
    old_position: number
    new_position: number
  } | null
}

export function PlayerTabs(props: Props) {
  const [tab, setTab] = useState<Tab>('prediction')

  const showOriginalTab = !!props.shift_info && !!props.original_predictions

  return (
    <div>
      <div
        role="tablist"
        className="mb-5 flex flex-wrap gap-1 rounded-lg border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <TabButton active={tab === 'prediction'} onClick={() => setTab('prediction')}>
          Prediction
        </TabButton>
        {showOriginalTab && (
          <TabButton active={tab === 'original'} onClick={() => setTab('original')}>
            Original
          </TabButton>
        )}
        <TabButton
          active={tab === 'fixtures'}
          onClick={() => setTab('fixtures')}
          disabled={!props.fixturesAvailable}
        >
          Fixtures
          {props.fixturesAvailable && (
            <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {props.fixtures.length}
            </span>
          )}
        </TabButton>
        <TabButton active={tab === 'pl_table'} onClick={() => setTab('pl_table')}>
          PL Table
        </TabButton>
        <TabButton active={tab === 'scenario'} onClick={() => setTab('scenario')}>
          What if?
        </TabButton>
      </div>

      {tab === 'prediction' && (
        <PredictionTab
          scored={props.scored}
          total={props.total}
          table={props.current_table}
        />
      )}
      {tab === 'original' && showOriginalTab && (
        <OriginalTab
          original={props.original_predictions!}
          shift={props.shift_info!}
        />
      )}
      {tab === 'fixtures' && <FixturesTab fixtures={props.fixtures} />}
      {tab === 'pl_table' && (
        <PLTableTab table={props.current_table} scored={props.scored} />
      )}
      {tab === 'scenario' && (
        <ScenarioBuilder
          player_id={props.scenario_player_id}
          fixtures={props.scenario_fixtures}
          current_standings={props.scenario_standings}
          all_players={props.scenario_players}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
  disabled = false,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        active
          ? 'flex-1 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900'
          : disabled
          ? 'flex-1 rounded-md px-3 py-2 text-sm text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
          : 'flex-1 rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
      }
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Prediction tab
// ---------------------------------------------------------------------------

function PredictionTab({
  scored,
  total,
  table,
}: {
  scored: ScoredPrediction[]
  total: number
  table: { position: number; team_name: string; points: number }[]
}) {
  // Lookup: points at each PL position right now.
  const pointsAtPosition = new Map<number, number>(
    table.map((t) => [t.position, t.points])
  )
  // Lookup: a team's current points (by name — actual table doesn't ship the
  // team_id with the prediction-tab data, but team names are unique).
  const pointsByTeamName = new Map<string, number>(
    table.map((t) => [t.team_name, t.points])
  )

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Your prediction</span>
        <span>5 / 3 / 1 / 0</span>
      </div>
      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-500 sm:hidden">
        Swipe sideways to see all columns →
      </p>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
            <tr>
              <th className="px-2 py-2 text-left align-bottom font-medium sm:px-3">
                <div className="flex flex-col leading-tight">
                  <span>My</span>
                  <span>prediction</span>
                </div>
              </th>
              <th className="px-2 py-2 text-left align-bottom font-medium sm:px-3">
                <div className="flex flex-col leading-tight">
                  <span aria-hidden="true">&nbsp;</span>
                  <span>Team</span>
                </div>
              </th>
              <th className="px-2 py-2 text-left align-bottom font-medium sm:px-3">
                <div className="flex flex-col leading-tight">
                  <span>My</span>
                  <span>points</span>
                </div>
              </th>
              <th className="px-2 py-2 text-left align-bottom font-medium sm:px-3">
                <div className="flex flex-col leading-tight">
                  <span>PL</span>
                  <span>ranking</span>
                </div>
              </th>
              <th className="px-2 py-2 text-left align-bottom font-medium sm:px-3">
                <div className="flex flex-col leading-tight">
                  <span>PL points</span>
                  <span>variance</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {scored.map((row) => {
              // Points gap: how far the team's actual points sit from the
              // points held by whoever is at the predicted position right now.
              // Positive = team is ahead of the predicted spot (over-achieving
              // the prediction). Negative = team is behind (needs to climb).
              // Hidden for exact hits since the gap is 0 by definition.
              let gap: number | null = null
              if (row.actual_position != null && row.distance != null && row.distance !== 0) {
                const teamPts = pointsByTeamName.get(row.team_name)
                const targetPts = pointsAtPosition.get(row.position)
                if (teamPts != null && targetPts != null) {
                  gap = teamPts - targetPts
                }
              }
              return (
                <tr
                  key={row.team_id}
                  className={
                    row.is_joker
                      ? 'border-t border-zinc-100 bg-amber-50/60 dark:border-zinc-800 dark:bg-amber-500/5'
                      : 'border-t border-zinc-100 dark:border-zinc-800'
                  }
                >
                  <td className="px-2 py-2 tabular-nums text-zinc-600 dark:text-zinc-400 sm:px-3">
                    {row.position}
                  </td>
                  <td className="px-2 py-2 sm:px-3">
                    <span className="inline-flex items-center gap-2">
                      <Link
                        href={`/team/${slugifyTeam(row.team_name)}`}
                        className="inline-flex items-center gap-2 font-medium hover:underline"
                      >
                        <TeamBadge teamName={row.team_name} size={20} />
                        <span className="whitespace-nowrap">{row.team_name}</span>
                      </Link>
                      {row.is_joker && (
                        <span
                          title="Joker (×2)"
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-[10px] font-bold uppercase tracking-tight text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
                        >
                          J
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-2 py-2 sm:px-3">
                    {/*
                      Color tier driven by base_points (distance), not the
                      final value — so a Joker-doubled "1-off" hit still
                      shows yellow (it's a 3pt tier × 2 = 6 pts), and an
                      exact-hit Joker shows green at 10 pts.
                    */}
                    <span
                      className={
                        row.base_points === 5
                          ? 'font-semibold tabular-nums text-emerald-700 dark:text-emerald-400'
                          : row.base_points === 3
                            ? 'font-semibold tabular-nums text-amber-700 dark:text-amber-400'
                            : row.base_points === 1
                              ? 'font-semibold tabular-nums text-rose-700 dark:text-rose-400'
                              : 'tabular-nums text-zinc-400 dark:text-zinc-600'
                      }
                    >
                      {row.points}
                    </span>
                  </td>
                  <td className="px-2 py-2 tabular-nums text-zinc-600 dark:text-zinc-400 sm:px-3">
                    {row.actual_position ?? '—'}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums sm:px-3">
                    {gap == null ? (
                      <span className="text-zinc-300 dark:text-zinc-700">—</span>
                    ) : (
                      <span
                        className={
                          gap > 0
                            ? 'font-medium text-sky-700 dark:text-sky-400'
                            : 'font-medium text-amber-700 dark:text-amber-400'
                        }
                      >
                        {gap > 0 ? '+' : ''}
                        {gap} pts
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900/60">
              <td colSpan={2} className="px-3 py-2 uppercase tracking-wide text-xs text-zinc-600 dark:text-zinc-400">
                Total
              </td>
              <td className="px-3 py-2 text-emerald-700 dark:text-emerald-400 tabular-nums">
                {total}
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Original prediction tab
// ---------------------------------------------------------------------------

function OriginalTab({
  original,
  shift,
}: {
  original: OriginalPrediction[]
  shift: { team_name: string; old_position: number; new_position: number }
}) {
  const sorted = [...original].sort((a, b) => a.position - b.position)
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Your season-start prediction</span>
        <span>Pre-shift</span>
      </div>

      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700/40 dark:bg-amber-500/10">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-300">
          Mid-season shift on file
        </p>
        <p className="mt-1.5 leading-relaxed">
          You moved <strong>{shift.team_name}</strong> from{' '}
          <strong>position #{shift.old_position}</strong> to{' '}
          <strong>position #{shift.new_position}</strong> during the January
          window. The "Prediction" tab shows your current (post-shift) lineup;
          this tab shows what you originally went with at season start.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Position</th>
              <th className="px-3 py-2 text-left font-medium">Team</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.team_name}
                className={
                  row.is_joker
                    ? 'border-t border-zinc-100 bg-amber-50/60 dark:border-zinc-800 dark:bg-amber-500/5'
                    : 'border-t border-zinc-100 dark:border-zinc-800'
                }
              >
                <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                  {row.position}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/team/${slugifyTeam(row.team_name)}`}
                    className="inline-flex items-center gap-2 font-medium hover:underline"
                  >
                    <TeamBadge teamName={row.team_name} size={20} />
                    {row.team_name}
                  </Link>
                  {row.is_joker && (
                    <span className="ml-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                      Joker × 2
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Fixtures tab
// ---------------------------------------------------------------------------

function FixturesTab({ fixtures }: { fixtures: FixtureLookAhead[] }) {
  if (fixtures.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No upcoming fixtures in the next 30 days.
      </div>
    )
  }
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Upcoming fixtures</span>
        <span>Next {fixtures.length} matches</span>
      </div>
      <div className="space-y-3">
        {fixtures.map((f) => (
          <FixtureCard key={f.fixture_id} fixture={f} />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
        Each card shows the teams in the match, where you predicted them, and
        where they sit in the actual table right now. Predicting how a result
        will move your score is genuinely hard — too many other matches happen
        the same week — so we leave that read to you.
      </p>
    </section>
  )
}

function FixtureCard({ fixture }: { fixture: FixtureLookAhead }) {
  const date = new Date(fixture.starting_at)
  const dateStr = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  const timeStr = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const isLive = fixture.live_period && fixture.live_period !== 'FT'

  return (
    <div
      className={
        isLive
          ? 'rounded-xl border-2 border-emerald-400 bg-white p-4 dark:border-emerald-500/60 dark:bg-zinc-900'
          : fixture.has_joker
            ? 'rounded-xl border border-amber-300 bg-amber-50/30 p-4 dark:border-amber-500/40 dark:bg-amber-500/5'
            : 'rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900'
      }
    >
      <div className="mb-3 flex items-baseline justify-between text-xs">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <span className="relative h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Live · {formatPeriod(fixture.live_period)}
            {fixture.live_home_score != null && fixture.live_away_score != null && (
              <>
                {' '}· {fixture.live_home_score}–{fixture.live_away_score}
              </>
            )}
          </span>
        ) : (
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {dateStr} · {timeStr}
          </span>
        )}
        {fixture.has_joker && !isLive && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            ⭐ Joker match
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FixtureSideCell side={fixture.home} label="Home" />
        <FixtureSideCell side={fixture.away} label="Away" />
      </div>
    </div>
  )
}

function FixtureSideCell({
  side,
  label,
}: {
  side: FixtureSide
  label: string
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
      <div className="mt-0.5">
        <Link
          href={`/team/${slugifyTeam(side.team_name)}`}
          className="inline-flex items-center gap-1.5 font-medium leading-tight hover:underline"
        >
          <TeamBadge teamName={side.team_name} size={16} />
          {side.team_name}
        </Link>
        {side.is_joker && (
          <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            Joker
          </span>
        )}
      </div>
      <div className="mt-1 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
        You predicted #{side.predicted_position ?? '—'} · league position #{side.actual_position ?? '—'}
      </div>
      {/*
        Three mutually exclusive states under the position line:
        - exact hit  → green "Correct position" badge
        - gap > 0    → blue "+N pts vs your call" (team ahead of predicted)
        - gap < 0    → yellow "−N pts vs your call" (team behind predicted)
      */}
      {side.actual_position != null &&
      side.predicted_position != null &&
      side.actual_position === side.predicted_position ? (
        <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
          ✓ Correct position
        </div>
      ) : (
        side.points_gap != null && (
          <div
            className={
              side.points_gap > 0
                ? 'mt-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400'
                : 'mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400'
            }
          >
            {side.points_gap > 0 ? '+' : ''}
            {side.points_gap} pts vs your prediction
          </div>
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// PL Table tab
// ---------------------------------------------------------------------------

function PLTableTab({
  table,
  scored,
}: {
  table: { position: number; team_name: string; points: number }[]
  scored: ScoredPrediction[]
}) {
  // Lookup: team_name → ScoredPrediction so we can show how each team
  // currently contributes to the viewing player's total.
  const scoredByName = new Map<string, ScoredPrediction>(
    scored.map((s) => [s.team_name, s])
  )

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Current Premier League table</span>
        <span>Live</span>
      </div>
      <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
        {table.map((row) => {
          const s = scoredByName.get(row.team_name)
          // Color tier based on the player's base_points for this team —
          // same palette as the prediction table for consistency.
          const yourPtsClass =
            s == null
              ? 'tabular-nums text-zinc-400 dark:text-zinc-600'
              : s.base_points === 5
                ? 'font-semibold tabular-nums text-emerald-700 dark:text-emerald-400'
                : s.base_points === 3
                  ? 'font-semibold tabular-nums text-amber-700 dark:text-amber-400'
                  : s.base_points === 1
                    ? 'font-semibold tabular-nums text-rose-700 dark:text-rose-400'
                    : 'tabular-nums text-zinc-400 dark:text-zinc-600'
          return (
            <li
              key={row.position}
              className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-800"
            >
              <span className="w-6 text-right tabular-nums text-zinc-500">{row.position}</span>
              <TeamBadge teamName={row.team_name} size={20} />
              <Link href={`/team/${slugifyTeam(row.team_name)}`} className="flex-1 truncate hover:underline">
                {row.team_name}
              </Link>
              {s?.is_joker && (
                <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  Joker
                </span>
              )}
              <span className="w-16 text-right tabular-nums text-zinc-500">
                {row.points} pts
              </span>
              <span className={`w-16 text-right ${yourPtsClass}`}>
                {s?.points ?? 0} pts
              </span>
            </li>
          )
        })}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
        Left column is the team&apos;s actual Premier League points. Right
        column is the points you&apos;re currently earning from where this
        team sits versus where you predicted them.
      </p>
    </section>
  )
}

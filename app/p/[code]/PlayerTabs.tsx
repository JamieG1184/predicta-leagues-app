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

      {tab === 'prediction' && <PredictionTab scored={props.scored} total={props.total} />}
      {tab === 'original' && showOriginalTab && (
        <OriginalTab
          original={props.original_predictions!}
          shift={props.shift_info!}
        />
      )}
      {tab === 'fixtures' && <FixturesTab fixtures={props.fixtures} />}
      {tab === 'pl_table' && <PLTableTab table={props.current_table} />}
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
}: {
  scored: ScoredPrediction[]
  total: number
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Your prediction</span>
        <span>5 / 3 / 1 / 0</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
            <tr>
              <th className="px-3 py-2 text-left font-medium">You</th>
              <th className="px-3 py-2 text-left font-medium">Team</th>
              <th className="px-3 py-2 text-left font-medium">League position</th>
              <th className="px-3 py-2 text-right font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((row) => (
              <tr
                key={row.team_id}
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
                <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">
                  {row.actual_position ?? '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={
                      row.points > 0
                        ? 'font-semibold tabular-nums text-emerald-700 dark:text-emerald-400'
                        : 'tabular-nums text-zinc-400 dark:text-zinc-600'
                    }
                  >
                    {row.points}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold dark:border-zinc-700 dark:bg-zinc-900/60">
              <td colSpan={3} className="px-3 py-2 text-right uppercase tracking-wide text-xs text-zinc-600 dark:text-zinc-400">
                Total
              </td>
              <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400 tabular-nums">
                {total}
              </td>
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
            Live · {fixture.live_period}
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
    </div>
  )
}

// ---------------------------------------------------------------------------
// PL Table tab
// ---------------------------------------------------------------------------

function PLTableTab({
  table,
}: {
  table: { position: number; team_name: string; points: number }[]
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>Current Premier League table</span>
        <span>Live</span>
      </div>
      <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
        {table.map((row) => (
          <li
            key={row.position}
            className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-800"
          >
            <span className="w-6 text-right tabular-nums text-zinc-500">{row.position}</span>
            <TeamBadge teamName={row.team_name} size={20} />
            <Link href={`/team/${slugifyTeam(row.team_name)}`} className="flex-1 truncate hover:underline">
              {row.team_name}
            </Link>
            <span className="tabular-nums text-zinc-500">{row.points} pts</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

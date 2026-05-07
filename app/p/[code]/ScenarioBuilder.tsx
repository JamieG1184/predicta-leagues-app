'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  type FixtureOutcome,
  type ScenarioFixture,
  type ScenarioStanding,
  type ScenarioPlayer,
  projectLeaderboard,
  projectStandings,
} from '@/src/lib/scenario'
import { slugifyTeam } from '@/src/lib/slugify'
import { TeamBadge } from '../../_components/TeamBadge'

type Props = {
  player_id: number
  fixtures: ScenarioFixture[]
  current_standings: ScenarioStanding[]
  all_players: ScenarioPlayer[]
}

export function ScenarioBuilder(props: Props) {
  const [scenarios, setScenarios] = useState<Map<number, FixtureOutcome>>(new Map())
  const [showResults, setShowResults] = useState(false)
  const [generateTick, setGenerateTick] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (generateTick > 0 && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [generateTick])

  const handleGenerate = () => {
    setShowResults(true)
    setGenerateTick((t) => t + 1)
  }

  const setOutcome = (fixtureId: number, outcome: FixtureOutcome) => {
    setScenarios((prev) => {
      const next = new Map(prev)
      if (outcome === 'skip') next.delete(fixtureId)
      else next.set(fixtureId, outcome)
      return next
    })
  }

  const setAllOutcomes = (outcome: FixtureOutcome) => {
    if (outcome === 'skip') {
      setScenarios(new Map())
      return
    }
    const next = new Map<number, FixtureOutcome>()
    for (const f of props.fixtures) next.set(f.fixture_id, outcome)
    setScenarios(next)
  }

  const projectedStandings = useMemo(
    () => projectStandings(props.current_standings, scenarios, props.fixtures),
    [props.current_standings, scenarios, props.fixtures]
  )

  const leaderboard = useMemo(
    () => projectLeaderboard(props.all_players, props.current_standings, projectedStandings),
    [props.all_players, props.current_standings, projectedStandings]
  )

  const me = leaderboard.find((r) => r.player_id === props.player_id)
  const filledCount = scenarios.size
  const remainingCount = props.fixtures.length - filledCount

  // Map current → projected positions for movement indicators
  const currentPositionByTeamId = useMemo(
    () => new Map(props.current_standings.map((s) => [s.team_id, s.position])),
    [props.current_standings]
  )

  if (props.fixtures.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No upcoming fixtures to model. The season is over or hasn&apos;t started.
      </div>
    )
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>What if?</span>
        <span>
          {filledCount} of {props.fixtures.length} set
        </span>
      </div>

      {/* Quick actions */}
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        <QuickButton label="All home wins" onClick={() => setAllOutcomes('home')} />
        <QuickButton label="All draws" onClick={() => setAllOutcomes('draw')} />
        <QuickButton label="All away wins" onClick={() => setAllOutcomes('away')} />
        <QuickButton label="Reset" onClick={() => setAllOutcomes('skip')} />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={filledCount === 0}
          className={
            filledCount === 0
              ? 'ml-auto cursor-not-allowed rounded bg-zinc-200 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
              : 'ml-auto rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-zinc-900 dark:hover:bg-emerald-400'
          }
        >
          Generate scenario
        </button>
      </div>

      {/* Fixture list */}
      <ol className="mb-6 space-y-2">
        {props.fixtures.map((f) => (
          <FixtureRow
            key={f.fixture_id}
            fixture={f}
            outcome={scenarios.get(f.fixture_id) ?? 'skip'}
            onChange={(o) => setOutcome(f.fixture_id, o)}
          />
        ))}
      </ol>

      {showResults && filledCount > 0 && (
        <div ref={resultsRef} className="scroll-mt-4">
          <ScenarioResults
            me={me}
            leaderboard={leaderboard}
            projectedStandings={projectedStandings}
            currentPositionByTeamId={currentPositionByTeamId}
            remainingCount={remainingCount}
          />
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
        The projection adds 3 points to the winner, 1 each for a draw, and a
        ±1 goal-difference adjustment for the result. Skipped fixtures contribute
        no movement. Tiebreaks fall to goal difference, then alphabetical name.
      </p>
    </section>
  )
}

function FixtureRow({
  fixture,
  outcome,
  onChange,
}: {
  fixture: ScenarioFixture
  outcome: FixtureOutcome
  onChange: (o: FixtureOutcome) => void
}) {
  const date = new Date(fixture.starting_at)
  const dateStr = date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="inline-flex items-center gap-1.5 font-medium leading-tight">
          <TeamBadge teamName={fixture.home_team_name} size={16} />
          {fixture.home_team_name}{' '}
          <span className="text-zinc-400">vs</span>{' '}
          <TeamBadge teamName={fixture.away_team_name} size={16} />
          {fixture.away_team_name}
        </span>
        <span className="text-[10px] text-zinc-500">{dateStr}</span>
      </div>
      <div className="grid grid-cols-4 gap-1 text-xs">
        <OutcomeButton
          label="Skip"
          active={outcome === 'skip'}
          onClick={() => onChange('skip')}
        />
        <OutcomeButton
          label={`${fixture.home_team_name.split(' ')[0]} win`}
          active={outcome === 'home'}
          onClick={() => onChange('home')}
        />
        <OutcomeButton
          label="Draw"
          active={outcome === 'draw'}
          onClick={() => onChange('draw')}
        />
        <OutcomeButton
          label={`${fixture.away_team_name.split(' ')[0]} win`}
          active={outcome === 'away'}
          onClick={() => onChange('away')}
        />
      </div>
    </li>
  )
}

function OutcomeButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'rounded bg-zinc-900 px-2 py-1.5 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900'
          : 'rounded border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800'
      }
    >
      {label}
    </button>
  )
}

function QuickButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {label}
    </button>
  )
}

function ScenarioResults({
  me,
  leaderboard,
  projectedStandings,
  currentPositionByTeamId,
  remainingCount,
}: {
  me?: ReturnType<typeof projectLeaderboard>[number]
  leaderboard: ReturnType<typeof projectLeaderboard>
  projectedStandings: ScenarioStanding[]
  currentPositionByTeamId: Map<number, number>
  remainingCount: number
}) {
  return (
    <div className="space-y-6">
      {me && (
        <section>
          <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
            <span>Your projected league position</span>
            <span>Under this scenario</span>
          </div>
          <ProjectedLeaguePosition
            me={me}
            leaderboard={leaderboard}
            remainingCount={remainingCount}
          />
        </section>
      )}

      <section>
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Projected league leaderboard</span>
          <span>{leaderboard.length} players</span>
        </div>
        <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {leaderboard.map((r) => (
            <li
              key={r.player_id}
              className={
                me && r.player_id === me.player_id
                  ? 'flex items-center gap-3 border-b border-zinc-100 bg-emerald-50 px-3 py-2 last:border-0 dark:border-zinc-800 dark:bg-emerald-500/10'
                  : 'flex items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-800'
              }
            >
              <span className="w-6 text-right tabular-nums text-zinc-500">{r.projected_rank}</span>
              <RankChangeIndicator change={r.rank_change} />
              <Link
                href={`/p/${r.invite_code}`}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {r.display_name}
              </Link>
              <span className="tabular-nums text-zinc-500">
                {r.delta > 0 ? '+' : ''}
                {r.delta}
              </span>
              <span className="w-10 text-right font-semibold tabular-nums">{r.projected_score}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Projected Premier League table</span>
          <span>{projectedStandings.length} teams</span>
        </div>
        <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {projectedStandings.map((s) => {
            const currentPos = currentPositionByTeamId.get(s.team_id) ?? s.position
            const change = currentPos - s.position
            return (
              <li
                key={s.team_id}
                className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-800"
              >
                <span className="w-6 text-right tabular-nums text-zinc-500">{s.position}</span>
                <RankChangeIndicator change={change} />
                <TeamBadge teamName={s.team_name} size={20} />
                <Link
                  href={`/team/${slugifyTeam(s.team_name)}`}
                  className="flex-1 truncate hover:underline"
                >
                  {s.team_name}
                </Link>
                <span className="tabular-nums text-zinc-500">{s.points} pts</span>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}

function ProjectedLeaguePosition({
  me,
  leaderboard,
  remainingCount,
}: {
  me: ReturnType<typeof projectLeaderboard>[number]
  leaderboard: ReturnType<typeof projectLeaderboard>
  remainingCount: number
}) {
  const leader = leaderboard[0]
  const gapToLeader = leader ? leader.projected_score - me.projected_score : 0

  // Players you overtake = currently below you, projected above you (rank improves)
  const overtaken = leaderboard.filter(
    (r) =>
      r.player_id !== me.player_id &&
      r.current_rank > me.current_rank &&
      r.projected_rank < me.projected_rank
  )

  // Players who overtake you = currently above you, projected below you
  const overtakenBy = leaderboard.filter(
    (r) =>
      r.player_id !== me.player_id &&
      r.current_rank < me.current_rank &&
      r.projected_rank > me.projected_rank
  )

  // Player just above and below in projected
  const indexProjected = leaderboard.findIndex((r) => r.player_id === me.player_id)
  const above = indexProjected > 0 ? leaderboard[indexProjected - 1] : null
  const below =
    indexProjected >= 0 && indexProjected < leaderboard.length - 1
      ? leaderboard[indexProjected + 1]
      : null

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResultStat
          label="Projected rank"
          value={`#${me.projected_rank}`}
          sub={
            me.rank_change === 0
              ? `Held #${me.current_rank}`
              : me.rank_change > 0
              ? `▲ ${me.rank_change} from #${me.current_rank}`
              : `▼ ${Math.abs(me.rank_change)} from #${me.current_rank}`
          }
          direction={me.rank_change}
          accent
        />
        <ResultStat
          label="Projected score"
          value={String(me.projected_score)}
          sub={
            me.delta === 0
              ? `Same as current (${me.current_score})`
              : me.delta > 0
              ? `+${me.delta} vs current (${me.current_score})`
              : `${me.delta} vs current (${me.current_score})`
          }
          direction={me.delta}
        />
        <ResultStat
          label="Gap to leader"
          value={
            leader && leader.player_id === me.player_id
              ? 'Leader'
              : `${gapToLeader} pts`
          }
          sub={
            leader && leader.player_id !== me.player_id
              ? `Behind ${leader.display_name}`
              : 'You hold the top spot'
          }
        />
        <ResultStat
          label="Skipped fixtures"
          value={String(remainingCount)}
          sub="No outcome chosen"
        />
      </div>

      {(above || below || overtaken.length > 0 || overtakenBy.length > 0) && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
          {above && (
            <p>
              Above you in the league:{' '}
              <Link
                href={`/p/${above.invite_code}`}
                className="font-semibold hover:underline"
              >
                {above.display_name}
              </Link>{' '}
              on {above.projected_score} pts ({above.projected_score - me.projected_score} ahead).
            </p>
          )}
          {below && (
            <p>
              Below you in the league:{' '}
              <Link
                href={`/p/${below.invite_code}`}
                className="font-semibold hover:underline"
              >
                {below.display_name}
              </Link>{' '}
              on {below.projected_score} pts ({me.projected_score - below.projected_score} behind you).
            </p>
          )}
          {overtaken.length > 0 && (
            <p className="mt-1.5 text-emerald-700 dark:text-emerald-400">
              Players you overtake under this scenario:{' '}
              {overtaken.map((p) => p.display_name).join(', ')}.
            </p>
          )}
          {overtakenBy.length > 0 && (
            <p className="mt-1.5 text-rose-700 dark:text-rose-400">
              Players who overtake you under this scenario:{' '}
              {overtakenBy.map((p) => p.display_name).join(', ')}.
            </p>
          )}
        </div>
      )}
    </>
  )
}

function ResultStat({
  label,
  value,
  sub,
  direction = 0,
  accent = false,
}: {
  label: string
  value: string
  sub?: string
  direction?: number
  accent?: boolean
}) {
  const valueClass =
    direction > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : direction < 0
      ? 'text-rose-700 dark:text-rose-400'
      : ''
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={`${
          accent ? 'mt-1 text-2xl font-semibold tabular-nums' : 'mt-1 text-lg font-semibold tabular-nums'
        } ${valueClass}`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-500">{sub}</div>
      )}
    </div>
  )
}

function RankChangeIndicator({ change }: { change: number }) {
  if (change === 0) return <span className="w-6 text-center text-xs text-zinc-400">·</span>
  if (change > 0) {
    return (
      <span className="w-6 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">
        ▲{change}
      </span>
    )
  }
  return (
    <span className="w-6 text-center text-xs font-medium text-rose-700 dark:text-rose-400 tabular-nums">
      ▼{Math.abs(change)}
    </span>
  )
}

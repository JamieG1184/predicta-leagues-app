'use client'

// One row in the homepage's Live Now strip. Owns its own "flash GOAL!" state:
// when the LivePoller dispatches a predicta-goal event for THIS fixture, the
// row briefly transforms into a pulsing green banner showing the new score,
// then returns to its normal layout.

import { useEffect, useRef, useState } from 'react'
import { TeamBadge } from './TeamBadge'
import { GOAL_EVENT_NAME, type GoalEventDetail } from './LivePoller'

const GOAL_FLASH_MS = 3000

type Props = {
  fixture_id: number
  home_team_name: string
  away_team_name: string
  live_home_score: number | null
  live_away_score: number | null
  period_label: string
}

export function LiveFixtureRow({
  fixture_id,
  home_team_name,
  away_team_name,
  live_home_score,
  live_away_score,
  period_label,
}: Props) {
  // While `flashing` is true the row replaces its normal content with the
  // GOAL banner. flashScore stores the score AT THE MOMENT OF THE GOAL so we
  // can still show the score even if the row's props haven't yet been
  // refreshed by router.refresh().
  const [flashing, setFlashing] = useState(false)
  const [flashScore, setFlashScore] = useState<{ home: number; away: number } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onGoal(e: Event) {
      const detail = (e as CustomEvent<GoalEventDetail>).detail ?? []
      const match = detail.find((g) => g.fixture_id === fixture_id)
      if (!match) return
      setFlashScore({ home: match.home_score, away: match.away_score })
      setFlashing(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setFlashing(false), GOAL_FLASH_MS)
    }
    window.addEventListener(GOAL_EVENT_NAME, onGoal)
    return () => {
      window.removeEventListener(GOAL_EVENT_NAME, onGoal)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fixture_id])

  const hasScore = live_home_score != null && live_away_score != null

  if (flashing && flashScore) {
    return (
      <div className="flex animate-pulse items-center justify-center gap-3 rounded-xl border-2 border-emerald-500 bg-emerald-100 p-4 text-sm font-bold uppercase tracking-wider text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/30 dark:text-emerald-200">
        <span className="text-2xl">⚽</span>
        <span>GOAL!</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden font-medium normal-case sm:inline">{home_team_name}</span>
        <span className="rounded-md bg-emerald-200 px-2.5 py-1 text-base font-bold tabular-nums dark:bg-emerald-700/50">
          {flashScore.home} – {flashScore.away}
        </span>
        <span className="hidden font-medium normal-case sm:inline">{away_team_name}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-emerald-400 bg-white p-3 text-sm dark:border-emerald-500/60 dark:bg-zinc-900">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <span className="relative h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        {period_label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TeamBadge teamName={home_team_name} size={20} />
        <span className="truncate font-medium">{home_team_name}</span>
      </div>
      {hasScore ? (
        <span className="shrink-0 px-2 text-base font-bold tabular-nums">
          {live_home_score} – {live_away_score}
        </span>
      ) : (
        <span className="shrink-0 px-2 text-xs uppercase tracking-wider text-zinc-500">
          vs
        </span>
      )}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate text-right font-medium">{away_team_name}</span>
        <TeamBadge teamName={away_team_name} size={20} />
      </div>
    </div>
  )
}

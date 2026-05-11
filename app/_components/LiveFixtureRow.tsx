'use client'

// One row in the homepage's Live Now strip. Owns its own "flash highlight"
// state: when the LivePoller dispatches a predicta-highlight event for
// THIS fixture, the row briefly transforms into a coloured banner that
// matches the highlight type (goal / goal disallowed / penalty / red card),
// then returns to its normal layout.

import { useEffect, useRef, useState } from 'react'
import { TeamBadge } from './TeamBadge'
import {
  HIGHLIGHT_EVENT_NAME,
  type Highlight,
  type HighlightEventDetail,
} from './LivePoller'

const HIGHLIGHT_FLASH_MS = 3000

type Props = {
  fixture_id: number
  home_team_name: string
  away_team_name: string
  live_home_score: number | null
  live_away_score: number | null
  period_label: string
}

// Visual configuration per highlight type — kept colocated with the
// rendering so adding a new type is a single declarative change.
const HIGHLIGHT_STYLES: Record<
  Highlight['type'],
  { icon: string; label: string; container: string; chip: string }
> = {
  goal: {
    icon: '⚽',
    label: 'GOAL!',
    container:
      'border-emerald-500 bg-emerald-100 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-500/30 dark:text-emerald-200',
    chip: 'bg-emerald-200 dark:bg-emerald-700/50',
  },
  goal_disallowed: {
    icon: '❌',
    label: 'GOAL DISALLOWED · VAR',
    container:
      'border-zinc-400 bg-zinc-100 text-zinc-700 dark:border-zinc-500 dark:bg-zinc-700/40 dark:text-zinc-200',
    chip: 'bg-zinc-200 dark:bg-zinc-600/60',
  },
  penalty: {
    icon: '🎯',
    label: 'PENALTY!',
    container:
      'border-amber-500 bg-amber-100 text-amber-800 dark:border-amber-400 dark:bg-amber-500/30 dark:text-amber-200',
    chip: 'bg-amber-200 dark:bg-amber-700/50',
  },
  red_card: {
    icon: '🟥',
    label: 'RED CARD!',
    container:
      'border-rose-500 bg-rose-100 text-rose-800 dark:border-rose-400 dark:bg-rose-500/30 dark:text-rose-200',
    chip: 'bg-rose-200 dark:bg-rose-700/50',
  },
}

export function LiveFixtureRow({
  fixture_id,
  home_team_name,
  away_team_name,
  live_home_score,
  live_away_score,
  period_label,
}: Props) {
  // While `activeFlash` is set the row replaces its normal content with the
  // highlight banner. We keep the full highlight payload so the banner can
  // render the right colour + score even if the row's props haven't yet
  // been refreshed via router.refresh().
  const [activeFlash, setActiveFlash] = useState<Highlight | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onHighlight(e: Event) {
      const detail = (e as CustomEvent<HighlightEventDetail>).detail ?? []
      const match = detail.find((h) => h.fixture_id === fixture_id)
      if (!match) return
      setActiveFlash(match)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setActiveFlash(null), HIGHLIGHT_FLASH_MS)
    }
    window.addEventListener(HIGHLIGHT_EVENT_NAME, onHighlight)
    return () => {
      window.removeEventListener(HIGHLIGHT_EVENT_NAME, onHighlight)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fixture_id])

  const hasScore = live_home_score != null && live_away_score != null

  if (activeFlash) {
    const s = HIGHLIGHT_STYLES[activeFlash.type]
    const showScore =
      activeFlash.home_score != null && activeFlash.away_score != null
    return (
      <div
        className={`flex animate-pulse items-center justify-center gap-3 rounded-xl border-2 p-4 text-sm font-bold uppercase tracking-wider ${s.container}`}
      >
        <span className="text-2xl">{s.icon}</span>
        <span>{s.label}</span>
        <span className="hidden sm:inline">·</span>
        <span className="hidden font-medium normal-case sm:inline">{home_team_name}</span>
        {showScore && (
          <span className={`rounded-md px-2.5 py-1 text-base font-bold tabular-nums ${s.chip}`}>
            {activeFlash.home_score} – {activeFlash.away_score}
          </span>
        )}
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

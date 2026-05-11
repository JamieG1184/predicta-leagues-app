'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type LiveFixture = {
  id: number
  name: string
  state_id: number
  starting_at: string
  result_info: string | null
}

// Each entry describes one goal observed in this poll. fixture_id is the
// match's Sportmonks ID so individual row components can flash only when
// THEIR match scored.
export type GoalInfo = {
  fixture_id: number
  description: string
  home_score: number
  away_score: number
}

type LiveResponse = {
  live_fixtures: LiveFixture[]
  has_live_matches: boolean
  has_updates: boolean
  idle?: boolean
  next_fixture_at: string | null
  last_synced_at: string
  cached?: boolean
  goals_scored?: GoalInfo[]
}

// Custom event used to flash a "GOAL!" indicator on both the standings
// header (small pill) and the matching live fixture row (full banner).
export type GoalEventDetail = GoalInfo[]
export const GOAL_EVENT_NAME = 'predicta-goal'

const IDLE_INTERVAL_MS = 5 * 60_000
// Baseline polling during in-play 1st half. Tightened from 60s → 20s so
// goals refresh the page within ~20–30s rather than the previous up-to-90s
// worst case. Sportmonks usage stays well within quota.
const BASELINE_INTERVAL_MS = 20_000
const FAST_INTERVAL_MS = 10_000

// Sportmonks state IDs that indicate "near end" — second half, extra time,
// or stoppage-time periods. When any in-play fixture is in one of these
// states, we tighten the polling interval.
const NEAR_END_STATES = new Set([4, 6, 7, 8, 22])

function isNearEnd(fixtures: LiveFixture[]): boolean {
  return fixtures.some((f) => NEAR_END_STATES.has(f.state_id))
}

function intervalFor(status: LiveResponse | null): number {
  if (!status) return BASELINE_INTERVAL_MS
  if (status.idle) return IDLE_INTERVAL_MS
  if (status.has_live_matches && isNearEnd(status.live_fixtures))
    return FAST_INTERVAL_MS
  return BASELINE_INTERVAL_MS
}

export function LivePoller() {
  const router = useRouter()
  const [status, setStatus] = useState<LiveResponse | null>(null)
  const [tickAge, setTickAge] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Dedup key for goal events: the `last_synced_at` of the response we
  // already dispatched a goal-event for. Prevents re-firing when the
  // 30s in-memory cache returns the same goals to the next poll.
  const lastDispatchedGoalKeyRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      try {
        const res = await fetch('/api/live', { cache: 'no-store' })
        if (!res.ok) {
          throw new Error(`Live sync failed (HTTP ${res.status})`)
        }
        const json = (await res.json()) as LiveResponse
        if (cancelled) return
        setStatus(json)
        setError(null)
        // Fire a goal event when this response is the FIRST time we see
        // these goals (i.e. its last_synced_at differs from the last one
        // we dispatched for).
        if (
          json.goals_scored &&
          json.goals_scored.length > 0 &&
          json.last_synced_at !== lastDispatchedGoalKeyRef.current
        ) {
          lastDispatchedGoalKeyRef.current = json.last_synced_at
          window.dispatchEvent(
            new CustomEvent<GoalEventDetail>(GOAL_EVENT_NAME, {
              detail: json.goals_scored,
            })
          )
        }
        if (json.has_updates) {
          router.refresh()
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
      }
    }

    // Initial fire
    tick()

    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const interval = intervalFor(status)
      timer = setTimeout(async () => {
        await tick()
        if (!cancelled) schedule()
      }, interval)
    }
    schedule()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.idle, status?.has_live_matches, status?.live_fixtures.length])

  // Tick a "seconds since update" counter every second so the UI reads naturally
  useEffect(() => {
    if (!status) return
    setTickAge(0)
    const id = setInterval(() => setTickAge((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [status?.last_synced_at])

  if (error) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:border-rose-700/50 dark:bg-rose-500/10 dark:text-rose-300">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Live sync error
      </div>
    )
  }
  if (!status) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        Connecting…
      </div>
    )
  }

  if (status.has_live_matches) {
    const matchCount = status.live_fixtures.length
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-300">
        <span className="relative h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        Live · {matchCount} {matchCount === 1 ? 'match' : 'matches'} in play
      </div>
    )
  }

  // Idle: no fixtures within the immediate match window
  if (status.idle) {
    const next = status.next_fixture_at ? new Date(status.next_fixture_at) : null
    const nextStr = next
      ? next.toLocaleString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        {nextStr ? `Next match: ${nextStr}` : 'No upcoming matches'}
      </div>
    )
  }

  // Pre-match window: fixtures imminent, but none kicked off yet
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-700/50 dark:bg-amber-500/10 dark:text-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Match window open · standby
    </div>
  )
}

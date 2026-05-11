'use client'

// Client-side standings list with an opt-in "Live projection" toggle.
//
// - Default render uses the server-supplied `initialRows` (static, as of the
//   last fixture).
// - When toggle is ON, polls /api/projected-leaderboard every 30s to fetch
//   rows projected against the current in-play scores. The shared server
//   cache means concurrent users only generate one DB hit per cache window.
// - Toggle state persists in localStorage so the user's preference survives
//   reloads.
// - "Updated Xs ago" label refreshes once a second so the freshness is
//   always visible.

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { GOAL_EVENT_NAME, type GoalEventDetail } from './LivePoller'

// How long the GOAL pill stays on screen after a goal is detected.
const GOAL_PILL_MS = 12_000

type Row = {
  player: { id: number; display_name: string; invite_code: string }
  rank: number
  total: number
  joker_team_name: string | null
  joker_points: number
  exact_hits: number
  three_pt_hits?: number
  one_pt_hits?: number
  score_change?: number | null
  rank_change?: number | null
}

type ProjectedResult = {
  rows: Row[]
  in_play_count: number
  fetched_at: string
  has_projection: boolean
  cached?: boolean
}

const STORAGE_KEY = 'predictaProjectionEnabled'
const POLL_INTERVAL_MS = 30_000

export function StandingsList({
  initialRows,
  lastUpdateLabel,
}: {
  initialRows: Row[]
  lastUpdateLabel: string | null
}) {
  const [enabled, setEnabled] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [projection, setProjection] = useState<ProjectedResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // For the "Xs ago" label we tick now() once a second.
  const [, setTick] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // GOAL pill — shown for ~12s after the LivePoller dispatches a goal event.
  // Holds the most recent goal description (e.g. "Tottenham vs Leeds · 1–0").
  const [goalMessage, setGoalMessage] = useState<string | null>(null)
  const goalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onGoal(e: Event) {
      const detail = (e as CustomEvent<GoalEventDetail>).detail ?? []
      if (detail.length === 0) return
      setGoalMessage(detail[0] ?? 'Goal!')
      if (goalTimerRef.current) clearTimeout(goalTimerRef.current)
      goalTimerRef.current = setTimeout(() => setGoalMessage(null), GOAL_PILL_MS)
    }
    window.addEventListener(GOAL_EVENT_NAME, onGoal)
    return () => {
      window.removeEventListener(GOAL_EVENT_NAME, onGoal)
      if (goalTimerRef.current) clearTimeout(goalTimerRef.current)
    }
  }, [])

  // Hydrate toggle state from localStorage on mount.
  useEffect(() => {
    setHydrated(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'true') setEnabled(true)
    } catch {
      // ignore (e.g. SSR / privacy mode)
    }
  }, [])

  // Persist toggle.
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false')
    } catch {
      // ignore
    }
  }, [enabled, hydrated])

  const fetchProjection = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/projected-leaderboard', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: ProjectedResult = await res.json()
      setProjection(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Manage polling lifecycle.
  useEffect(() => {
    if (!enabled) {
      setProjection(null)
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    fetchProjection()
    pollRef.current = setInterval(fetchProjection, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [enabled, fetchProjection])

  // 1Hz tick so "Updated Xs ago" stays current.
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [enabled])

  const showProjected =
    enabled && !!projection && projection.has_projection && projection.rows.length > 0

  // For projected mode we want arrows comparing the projected position back to
  // the static (pre-projection) position, so players see how the in-play
  // matches are shifting them in real time.
  const staticByPlayerId = new Map(
    initialRows.map((r) => [r.player.id, { rank: r.rank, total: r.total }])
  )

  type DisplayRow = Row & {
    projected_score_change?: number | null
    projected_rank_change?: number | null
  }

  const rows: DisplayRow[] = showProjected
    ? projection!.rows.map((r) => {
        const base = staticByPlayerId.get(r.player.id)
        return {
          ...r,
          projected_score_change: base ? r.total - base.total : null,
          projected_rank_change: base ? base.rank - r.rank : null,
        }
      })
    : initialRows

  const fetchedAt = projection ? new Date(projection.fetched_at).getTime() : null
  const ageSec =
    fetchedAt != null ? Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000)) : null
  const ageLabel =
    ageSec == null
      ? null
      : ageSec < 60
        ? `${ageSec}s ago`
        : `${Math.floor(ageSec / 60)}m ago`

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-y-2 text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span className="flex flex-wrap items-center gap-2">
          Standings
          <span className="text-zinc-400 dark:text-zinc-600">·</span>
          <span>{initialRows.length} players</span>
          {!showProjected && lastUpdateLabel && (
            <>
              <span className="text-zinc-400 dark:text-zinc-600">·</span>
              <span>Updated {lastUpdateLabel}</span>
            </>
          )}
          {showProjected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              PROJECTED
            </span>
          )}
          {goalMessage && (
            <span
              title={goalMessage}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold normal-case tracking-normal text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
            >
              <span className="relative h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span>⚽ GOAL · {goalMessage}</span>
            </span>
          )}
        </span>
        <ProjectionToggle
          enabled={enabled}
          onToggle={setEnabled}
          ageLabel={enabled ? ageLabel : null}
          loading={loading}
        />
      </div>

      {enabled && projection && !projection.has_projection && (
        <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          No PL matches in play right now — showing the latest confirmed
          standings. Projection will activate automatically when the next match
          kicks off.
        </div>
      )}

      {enabled && error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-500/10 dark:text-rose-400">
          Couldn&apos;t fetch live projection ({error}). Showing static
          standings instead.
        </div>
      )}

      <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {rows.map((row, i) => (
          <li
            key={row.player.id}
            className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-800"
          >
            <span
              className={
                i < 3
                  ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
              }
            >
              {row.rank}
            </span>
            <Link
              href={`/p/${row.player.invite_code}`}
              className="min-w-0 flex-1 group"
            >
              <div className="flex items-baseline gap-2">
                <span className="truncate font-medium group-hover:underline">
                  {row.player.display_name}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500 dark:text-zinc-500">
                <span>
                  Joker:{' '}
                  <span className="text-zinc-700 dark:text-zinc-300">
                    {row.joker_team_name ?? '—'}
                  </span>{' '}
                  <span
                    className={
                      row.joker_points > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-zinc-400 dark:text-zinc-600'
                    }
                  >
                    ({row.joker_points} pts)
                  </span>
                </span>
              </div>
            </Link>
            {/*
              Movement arrows — sit to the LEFT of the hit pills.
              Two stacked indicators (when each is non-zero):
                ▲/▼ N points     — score change
                ▲/▼ N positions  — rank change

              Static mode: changes are vs the most recent prior snapshot.
              Projected mode: changes are vs the static (pre-projection)
              position, showing how the in-play match results would shift
              the player if they ended right now.
            */}
            {(() => {
              const scoreDelta = showProjected
                ? row.projected_score_change ?? 0
                : row.score_change ?? 0
              const rankDelta = showProjected
                ? row.projected_rank_change ?? 0
                : row.rank_change ?? 0
              const haveScore = showProjected
                ? row.projected_score_change != null && row.projected_score_change !== 0
                : row.score_change != null && row.score_change !== 0
              const haveRank = showProjected
                ? row.projected_rank_change != null && row.projected_rank_change !== 0
                : row.rank_change != null && row.rank_change !== 0
              if (!haveScore && !haveRank) return null
              return (
                <span className="flex shrink-0 items-center gap-2 text-xs font-semibold tabular-nums">
                  {haveRank && (
                    <span
                      className={
                        rankDelta > 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }
                    >
                      {rankDelta > 0 ? '▲' : '▼'} {Math.abs(rankDelta)} positions
                    </span>
                  )}
                  {haveScore && (
                    <span
                      className={
                        scoreDelta > 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }
                    >
                      {scoreDelta > 0 ? '▲' : '▼'} {Math.abs(scoreDelta)} points
                    </span>
                  )}
                </span>
              )
            })()}
            {/*
              Hit-quality pills — sit on the right side of the row, after
              the position arrows and before the total. Hidden on very
              narrow viewports so the row doesn't crowd; available from sm: up.
            */}
            <span className="hidden shrink-0 items-center gap-1 sm:ml-2 sm:inline-flex">
              <HitPill tone="exact" count={row.exact_hits} />
              <HitPill tone="three" count={row.three_pt_hits ?? 0} />
              <HitPill tone="one" count={row.one_pt_hits ?? 0} />
            </span>
            <span className="ml-auto shrink-0 text-right">
              <span className="block text-xl font-semibold tabular-nums">
                {row.total}
              </span>
              <span className="block text-xs uppercase tracking-wide text-zinc-500">
                pts
              </span>
            </span>
          </li>
        ))}
      </ol>

      {/*
        Footer disclaimer: tell players what triggers a refresh. Timestamp
        now sits in the section header above, so we just keep the
        behaviour note. Hidden in projected mode because freshness is
        already conveyed by the "Updated Xs ago" indicator on the toggle.
      */}
      {!showProjected && (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-500">
          Standings refresh automatically after each match completes.
        </p>
      )}
    </section>
  )
}

function HitPill({
  tone,
  count,
}: {
  tone: 'exact' | 'three' | 'one'
  count: number
}) {
  // Simplified pill: just the count, color-coded by tier.
  // Tooltip still names the tier so hover-curious players can decode.
  const label = tone === 'exact' ? '5pt' : tone === 'three' ? '3pt' : '1pt'
  const cls =
    tone === 'exact'
      ? 'inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-emerald-100 px-1.5 text-[11px] font-semibold tabular-nums text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
      : tone === 'three'
        ? 'inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold tabular-nums text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
        : 'inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold tabular-nums text-rose-800 dark:bg-rose-500/15 dark:text-rose-300'
  return (
    <span
      className={cls}
      title={`${count} pick${count === 1 ? '' : 's'} worth ${label} each`}
    >
      {count}
    </span>
  )
}

function ProjectionToggle({
  enabled,
  onToggle,
  ageLabel,
  loading,
}: {
  enabled: boolean
  onToggle: (next: boolean) => void
  ageLabel: string | null
  loading: boolean
}) {
  return (
    <span className="flex items-center gap-2 normal-case tracking-normal">
      {enabled && (
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {loading && !ageLabel
            ? 'Updating…'
            : ageLabel
              ? `Updated ${ageLabel}`
              : ''}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
        className={
          enabled
            ? 'inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-200 dark:border-amber-700/50 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30'
            : 'inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
        }
      >
        <span
          className={
            enabled
              ? 'h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500'
              : 'h-1.5 w-1.5 rounded-full bg-zinc-300 dark:bg-zinc-600'
          }
        />
        Live projection {enabled ? 'on' : 'off'}
      </button>
    </span>
  )
}

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  getAdminPlayerDetail,
  applyShift,
  revertShift,
  recalculateAllScores,
  computeShiftedPositions,
} from '@/src/lib/data'

export const dynamic = 'force-dynamic'

type Search = { error?: string; success?: string; preview_team?: string; preview_position?: string }
type Params = { code: string }

async function applyAction(formData: FormData) {
  'use server'
  const code = String(formData.get('code') ?? '')
  const teamId = Number(formData.get('team_id'))
  const newPosition = Number(formData.get('new_position'))
  if (!code || !teamId || !newPosition) {
    redirect(`/admin/shifts/${code}?error=Missing+fields`)
  }
  const result = await applyShift({ inviteCode: code, teamId, newPosition, appliedBy: 'admin' })
  if (!result.ok) {
    redirect(`/admin/shifts/${code}?error=${encodeURIComponent(result.error)}`)
  }
  await recalculateAllScores('shift_applied')
  redirect(`/admin/shifts/${code}?success=Shift+applied`)
}

async function revertAction(formData: FormData) {
  'use server'
  const code = String(formData.get('code') ?? '')
  const result = await revertShift(code)
  if (!result.ok) {
    redirect(`/admin/shifts/${code}?error=${encodeURIComponent(result.error)}`)
  }
  await recalculateAllScores('shift_reverted')
  redirect(`/admin/shifts/${code}?success=Shift+reverted`)
}

export default async function AdminShiftFormPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}) {
  const { code } = await params
  const { error, success, preview_team, preview_position } = await searchParams
  const detail = await getAdminPlayerDetail(code)
  if (!detail) notFound()

  const previewTeamId = preview_team ? Number(preview_team) : null
  const previewPosition = preview_position ? Number(preview_position) : null
  let previewedPositions: Map<number, number> | null = null
  if (
    previewTeamId &&
    previewPosition &&
    previewPosition >= 1 &&
    previewPosition <= 20
  ) {
    try {
      previewedPositions = computeShiftedPositions(
        detail.predictions.map((p) => ({ position: p.position, team_id: p.team_id })),
        previewTeamId,
        previewPosition
      )
    } catch {
      previewedPositions = null
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <div className="mb-6 flex items-baseline justify-between">
        <Link
          href="/admin/shifts"
          className="inline-flex items-center text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
        >
          ← Player list
        </Link>
        <Link
          href="/admin/logout"
          className="text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
        >
          Sign out
        </Link>
      </div>

      <header className="mb-8 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Admin · Shift entry
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{detail.display_name}</h1>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700/50 dark:bg-rose-500/10 dark:text-rose-300">
          {decodeURIComponent(error)}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-300">
          {success.replace(/\+/g, ' ')}
        </div>
      )}

      {detail.shift ? (
        <section className="mb-8 rounded-xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-700/50 dark:bg-emerald-500/10">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
            Current shift on file
          </div>
          <p className="mt-2 text-sm">
            <span className="font-semibold">{detail.shift.team_name}</span> moved from
            position <strong>#{detail.shift.old_position}</strong> to{' '}
            <strong>#{detail.shift.new_position}</strong>.
          </p>
          <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">
            Applied {new Date(detail.shift.applied_at).toLocaleString('en-GB')}
          </p>
          <form action={revertAction} className="mt-3">
            <input type="hidden" name="code" value={detail.invite_code} />
            <button
              type="submit"
              className="rounded border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-rose-700 hover:bg-rose-100 dark:border-rose-700/50 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
            >
              Revert this shift
            </button>
          </form>
        </section>
      ) : (
        <section className="mb-8">
          <div className="mb-3 text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
            Apply a shift
          </div>

          {/* Preview-only form (GET) */}
          <form
            action={`/admin/shifts/${detail.invite_code}`}
            method="GET"
            className="mb-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  Team to move
                </span>
                <select
                  name="preview_team"
                  defaultValue={previewTeamId ?? ''}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  required
                >
                  <option value="">Select a team…</option>
                  {detail.predictions.map((p) => (
                    <option key={p.team_id} value={p.team_id}>
                      {p.team_name} (currently #{p.position})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                  New position
                </span>
                <select
                  name="preview_position"
                  defaultValue={previewPosition ?? ''}
                  className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  required
                >
                  <option value="">Select a position…</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Position {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              className="mt-3 rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Preview cascade
            </button>
          </form>

          {previewedPositions && previewTeamId && previewPosition && (
            <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Resulting prediction
              </div>
              <ol className="mt-2 space-y-0.5 text-sm">
                {detail.predictions
                  .map((p) => ({
                    ...p,
                    new_position: previewedPositions!.get(p.team_id) ?? p.position,
                  }))
                  .sort((a, b) => a.new_position - b.new_position)
                  .map((p) => {
                    const moved = p.new_position !== p.position
                    return (
                      <li
                        key={p.team_id}
                        className={
                          moved
                            ? p.team_id === previewTeamId
                              ? 'flex items-center gap-2 rounded bg-emerald-100 px-2 py-1 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100'
                              : 'flex items-center gap-2 rounded bg-amber-50 px-2 py-1 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200'
                            : 'flex items-center gap-2 px-2 py-1'
                        }
                      >
                        <span className="w-7 text-right tabular-nums">{p.new_position}</span>
                        <span className="flex-1">{p.team_name}</span>
                        {moved && (
                          <span className="text-xs text-zinc-500">
                            (was #{p.position})
                          </span>
                        )}
                        {p.is_joker && (
                          <span className="rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                            Joker
                          </span>
                        )}
                      </li>
                    )
                  })}
              </ol>

              <form action={applyAction} className="mt-4">
                <input type="hidden" name="code" value={detail.invite_code} />
                <input type="hidden" name="team_id" value={previewTeamId} />
                <input type="hidden" name="new_position" value={previewPosition} />
                <button
                  type="submit"
                  className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-zinc-900"
                >
                  Apply this shift
                </button>
              </form>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          Current prediction (after any applied shift)
        </div>
        <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {detail.predictions
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((p) => (
              <li
                key={p.team_id}
                className={
                  p.is_joker
                    ? 'flex items-center gap-2 border-b border-zinc-100 bg-amber-50/60 px-3 py-2 last:border-0 dark:border-zinc-800 dark:bg-amber-500/5'
                    : 'flex items-center gap-2 border-b border-zinc-100 px-3 py-2 last:border-0 dark:border-zinc-800'
                }
              >
                <span className="w-7 text-right tabular-nums text-zinc-500">{p.position}</span>
                <span className="flex-1">{p.team_name}</span>
                {p.is_joker && (
                  <span className="rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                    Joker
                  </span>
                )}
              </li>
            ))}
        </ol>
      </section>
    </main>
  )
}

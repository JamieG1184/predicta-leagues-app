import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  getAdminPlayerDetail,
  updatePlayerPredictions,
  recalculateAllScores,
} from '@/src/lib/data'
import { TeamBadge } from '../../../_components/TeamBadge'

export const dynamic = 'force-dynamic'

type Params = { code: string }
type Search = { error?: string; success?: string }

async function saveAction(formData: FormData) {
  'use server'
  const code = String(formData.get('code') ?? '')
  const teamIds = formData.getAll('team_id').map((v) => Number(v))
  const jokerId = Number(formData.get('joker'))
  const predictions = teamIds.map((team_id) => ({
    team_id,
    position: Number(formData.get(`position_${team_id}`)),
    is_joker: team_id === jokerId,
  }))
  const result = await updatePlayerPredictions(code, predictions)
  if (!result.ok) {
    redirect(`/admin/predictions/${code}?error=${encodeURIComponent(result.error)}`)
  }
  await recalculateAllScores('predictions_edited')
  redirect(`/admin/predictions/${code}?success=${encodeURIComponent('Predictions saved.')}`)
}

export default async function EditPredictionsPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}) {
  const { code } = await params
  const { error, success } = await searchParams
  const detail = await getAdminPlayerDetail(code)
  if (!detail) notFound()

  const sortedPredictions = [...detail.predictions].sort((a, b) => a.position - b.position)

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
          Admin · Edit predictions
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{detail.display_name}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Use this form when you need to correct an error in the original 20-team prediction.
          Each team must occupy a unique position 1–20, and exactly one team must be marked
          as the Joker. Saving will recalculate league scores and clear any existing shift.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-700/50 dark:bg-rose-500/10 dark:text-rose-300">
          {decodeURIComponent(error)}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-300">
          {decodeURIComponent(success)}
        </div>
      )}

      <form action={saveAction}>
        <input type="hidden" name="code" value={detail.invite_code} />

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Team</th>
                <th className="px-3 py-2 text-left font-medium">Position</th>
                <th className="px-3 py-2 text-center font-medium">Joker</th>
              </tr>
            </thead>
            <tbody>
              {sortedPredictions.map((p) => (
                <tr
                  key={p.team_id}
                  className={
                    p.is_joker
                      ? 'border-t border-zinc-100 bg-amber-50/60 dark:border-zinc-800 dark:bg-amber-500/5'
                      : 'border-t border-zinc-100 dark:border-zinc-800'
                  }
                >
                  <td className="px-3 py-2">
                    <input type="hidden" name="team_id" value={p.team_id} />
                    <span className="inline-flex items-center gap-2 font-medium">
                      <TeamBadge teamName={p.team_name} size={20} />
                      {p.team_name}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      name={`position_${p.team_id}`}
                      defaultValue={p.position}
                      min={1}
                      max={20}
                      required
                      className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="joker"
                      value={p.team_id}
                      defaultChecked={p.is_joker}
                      required
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-zinc-900 dark:hover:bg-emerald-400"
          >
            Save predictions
          </button>
          <Link
            href="/admin/shifts"
            className="rounded border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </main>
  )
}

import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { getAllFeedback, setFeedbackResolved } from '@/src/lib/data'

export const dynamic = 'force-dynamic'

async function toggleResolvedAction(formData: FormData) {
  'use server'
  const id = Number(formData.get('id'))
  const resolved = formData.get('resolved') === 'true'
  await setFeedbackResolved(id, !resolved)
  revalidatePath('/admin/feedback')
}

const CATEGORY_LABELS: Record<string, string> = {
  general: 'General feedback',
  bug: 'Bug',
  feature: 'Feature idea',
  design: 'Design',
  question: 'Question',
  other: 'Other',
}

export default async function AdminFeedbackPage() {
  const feedback = await getAllFeedback()
  const unresolved = feedback.filter((f) => !f.resolved)
  const resolved = feedback.filter((f) => f.resolved)

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <div className="mb-6 flex items-baseline justify-between">
        <Link
          href="/admin/shifts"
          className="inline-flex items-center text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
        >
          ← Admin
        </Link>
        <Link
          href="/admin/logout"
          className="text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
        >
          Sign out
        </Link>
      </div>

      <header className="mb-10 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Admin · Feedback inbox
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Player feedback
        </h1>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Total" value={String(feedback.length)} />
          <Stat label="Unresolved" value={String(unresolved.length)} accent />
          <Stat label="Resolved" value={String(resolved.length)} />
        </div>
      </header>

      {feedback.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          No feedback submissions yet.
        </div>
      ) : (
        <>
          {unresolved.length > 0 && (
            <FeedbackSection
              title="Open"
              entries={unresolved}
              toggleResolvedAction={toggleResolvedAction}
            />
          )}
          {resolved.length > 0 && (
            <FeedbackSection
              title="Resolved"
              entries={resolved}
              toggleResolvedAction={toggleResolvedAction}
            />
          )}
        </>
      )}
    </main>
  )
}

function FeedbackSection({
  title,
  entries,
  toggleResolvedAction,
}: {
  title: string
  entries: Awaited<ReturnType<typeof getAllFeedback>>
  toggleResolvedAction: (formData: FormData) => void
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
        <span>{title}</span>
        <span>{entries.length}</span>
      </div>
      <div className="space-y-3">
        {entries.map((f) => (
          <div
            key={f.id}
            className={
              f.resolved
                ? 'rounded-xl border border-zinc-200 bg-white/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/60'
                : 'rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900'
            }
          >
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <span className="font-semibold">{f.player_name ?? 'Anonymous'}</span>
                {f.category && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {CATEGORY_LABELS[f.category] ?? f.category}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-[11px] text-zinc-500">
                {new Date(f.submitted_at).toLocaleString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{f.message}</p>
            <form action={toggleResolvedAction} className="mt-3">
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="resolved" value={String(f.resolved)} />
              <button
                type="submit"
                className={
                  f.resolved
                    ? 'rounded border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    : 'rounded bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-zinc-900 dark:hover:bg-emerald-400'
                }
              >
                {f.resolved ? 'Reopen' : 'Mark resolved'}
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div
        className={
          accent
            ? 'mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400'
            : 'mt-1 text-xl font-semibold tabular-nums'
        }
      >
        {value}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { submitFeedback } from '@/src/lib/data'

export const dynamic = 'force-dynamic'

type Search = { success?: string; error?: string }

async function submitAction(formData: FormData) {
  'use server'
  const player_name = String(formData.get('player_name') ?? '').slice(0, 80)
  const category = String(formData.get('category') ?? '').slice(0, 40)
  const message = String(formData.get('message') ?? '').slice(0, 2000)

  const result = await submitFeedback({ player_name, category, message })
  if (!result.ok) {
    redirect(`/feedback?error=${encodeURIComponent(result.error)}`)
  }
  redirect('/feedback?success=1')
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { success, error } = await searchParams

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
      <Link
        href="/"
        className="mb-6 inline-flex items-center text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
      >
        ← League
      </Link>

      <header className="mb-8 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Feedback
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Tell us what you think</h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Bugs, ideas, criticism, kind words — all welcome. Your feedback shapes
          where Predicta Leagues goes next.
        </p>
      </header>

      {success && (
        <div className="mb-6 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-700/50 dark:bg-emerald-500/10 dark:text-emerald-100">
          Thanks for the feedback. We&apos;ve received it.
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-700/50 dark:bg-rose-500/10 dark:text-rose-100">
          {decodeURIComponent(error)}
        </div>
      )}

      <form action={submitAction} className="space-y-4">
        <div>
          <label
            htmlFor="player_name"
            className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400"
          >
            Your name
            <span className="ml-1 font-normal lowercase text-zinc-400">(optional)</span>
          </label>
          <input
            id="player_name"
            name="player_name"
            type="text"
            placeholder="Leave blank to stay anonymous"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400"
          >
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue="general"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="general">General feedback</option>
            <option value="bug">Bug / something broken</option>
            <option value="feature">Feature idea</option>
            <option value="design">Visual / design</option>
            <option value="question">Question</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="message"
            className="block text-xs font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-400"
          >
            Your feedback
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={6}
            maxLength={2000}
            placeholder="What's on your mind?"
            className="mt-1 w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-[11px] text-zinc-500">Up to 2,000 characters.</p>
        </div>

        <button
          type="submit"
          className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-zinc-900 dark:hover:bg-emerald-400"
        >
          Send feedback
        </button>
      </form>
    </main>
  )
}

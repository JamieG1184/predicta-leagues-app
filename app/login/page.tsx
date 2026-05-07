import Link from 'next/link'

export const dynamic = 'force-dynamic'

type Search = { error?: string; redirect?: string }

export default async function SiteLoginPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { error, redirect } = await searchParams
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
        Premier League · 2025/26
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Predicta Leagues</h1>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Enter the access password your league organiser shared with you to view the
        live leaderboard, your prediction, and the season analysis.
      </p>

      <form action="/login/submit" method="GET" className="mt-6 space-y-3">
        {redirect && <input type="hidden" name="redirect" value={redirect} />}
        <input
          type="password"
          name="password"
          required
          autoFocus
          placeholder="Access password"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="w-full rounded bg-emerald-700 py-2 text-sm font-semibold text-white hover:bg-emerald-800 dark:bg-emerald-500 dark:text-zinc-900 dark:hover:bg-emerald-400"
        >
          Continue
        </button>
      </form>

      {error === 'invalid' && (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-400">
          That password didn&apos;t work. Try again, or check with your league
          organiser.
        </p>
      )}

      <div className="mt-10 border-t border-zinc-200 pt-4 text-center text-xs dark:border-zinc-800">
        <Link
          href="/admin"
          className="inline-block text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Admin login →
        </Link>
      </div>
    </main>
  )
}

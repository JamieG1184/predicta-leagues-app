export const dynamic = 'force-dynamic'

type Search = { error?: string; redirect?: string }

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { error, redirect } = await searchParams
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
        Admin · Predicta Leagues
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Enter the admin token to access the shift entry tool.
      </p>

      <form action="/admin/login" method="GET" className="mt-6 space-y-3">
        {redirect && <input type="hidden" name="redirect" value={redirect} />}
        <input
          type="password"
          name="token"
          required
          autoFocus
          placeholder="Admin token"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          className="w-full rounded bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Sign in
        </button>
      </form>

      {error === 'invalid' && (
        <p className="mt-3 text-sm text-rose-700 dark:text-rose-400">
          Invalid token. Try again.
        </p>
      )}
    </main>
  )
}

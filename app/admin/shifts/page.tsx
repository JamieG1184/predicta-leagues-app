import Link from 'next/link'
import { getAdminPlayerList } from '@/src/lib/data'

export const dynamic = 'force-dynamic'

export default async function AdminShiftsListPage() {
  const players = await getAdminPlayerList()
  const withShift = players.filter((p) => p.shift)
  const withoutShift = players.filter((p) => !p.shift)

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <div className="mb-6 flex items-baseline justify-between">
        <Link
          href="/"
          className="inline-flex items-center text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
        >
          ← League
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
          Admin · Mid-season shifts
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Player shift entry
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Apply each player&apos;s mid-season shift one at a time. Click a name to
          open the form. One shift per player — to change a shift, revert and
          re-apply.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
          <Stat label="Total players" value={String(players.length)} />
          <Stat label="Shifts applied" value={String(withShift.length)} accent />
          <Stat label="Pending" value={String(withoutShift.length)} />
        </div>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Players</span>
          <span>Apply shift · Edit prediction</span>
        </div>
        <ol className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {players.map((p) => (
            <li
              key={p.player_id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-100 px-3 py-2.5 last:border-0 dark:border-zinc-800"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{p.display_name}</span>
              {p.shift ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Shifted
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Pending
                </span>
              )}
              {p.shift && (
                <span className="hidden text-xs text-zinc-500 sm:inline">
                  {p.shift.team_name}: #{p.shift.old_position} → #{p.shift.new_position}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <Link
                  href={`/admin/shifts/${p.invite_code}`}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Apply shift
                </Link>
                <Link
                  href={`/admin/predictions/${p.invite_code}`}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Edit prediction
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
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

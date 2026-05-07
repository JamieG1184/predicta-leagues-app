import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getComparison, slugifyTeam } from '@/src/lib/data'
import { TeamBadge } from '../../../_components/TeamBadge'

export const dynamic = 'force-dynamic'

type Params = { a: string; b: string }

export default async function ComparePage({ params }: { params: Promise<Params> }) {
  const { a, b } = await params
  const comp = await getComparison(a, b)
  if (!comp) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <Link
        href="/"
        className="mb-6 inline-flex items-center text-xs font-medium uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100"
      >
        ← League
      </Link>

      <header className="mb-10 border-b border-zinc-200 pb-8 dark:border-zinc-800">
        <p className="text-xs font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Head-to-head · 2025/26
        </p>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <PlayerHeader player={comp.a} />
          <PlayerHeader player={comp.b} />
        </div>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
          They agreed on{' '}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">
            {comp.agreement_count} of 20 positions
          </span>
          {comp.agreement_count > 0 && (
            <> — positions {comp.agreement_positions.join(', ')}</>
          )}
          .
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between text-xs uppercase tracking-widest text-zinc-500 dark:text-zinc-500">
          <span>Side-by-side picks</span>
          <span>20 positions</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900/60">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Pos</th>
                <th className="px-3 py-2 text-left font-medium">{comp.a.player.display_name}</th>
                <th className="px-3 py-2 text-left font-medium">{comp.b.player.display_name}</th>
              </tr>
            </thead>
            <tbody>
              {comp.rows.map((row) => (
                <tr
                  key={row.position}
                  className={
                    row.same
                      ? 'border-t border-zinc-100 bg-emerald-50/50 dark:border-zinc-800 dark:bg-emerald-500/5'
                      : 'border-t border-zinc-100 dark:border-zinc-800'
                  }
                >
                  <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400 align-top">
                    {row.position}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.a ? <PickCell pick={row.a} /> : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.b ? <PickCell pick={row.b} /> : <span className="text-zinc-400">—</span>}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900/60">
                <td className="px-3 py-2 text-xs uppercase tracking-wide text-zinc-500">
                  Total
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {comp.a.total} pts
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {comp.b.total} pts
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Green-tinted rows are positions where they picked the same team. Joker
        picks are flagged. Click any team to see how the whole league predicted
        it.
      </p>
    </main>
  )
}

function PlayerHeader({
  player,
}: {
  player: { player: { display_name: string; invite_code: string }; rank: number; total: number; joker_team: string | null }
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
        Rank #{player.rank}
      </div>
      <Link
        href={`/p/${player.player.invite_code}`}
        className="mt-1 block text-lg font-semibold leading-tight hover:underline"
      >
        {player.player.display_name}
      </Link>
      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
          {player.total} pts
        </span>{' '}
        · Joker: {player.joker_team ?? '—'}
      </div>
    </div>
  )
}

function PickCell({
  pick,
}: {
  pick: {
    team_name: string
    actual_position: number | null
    distance: number | null
    points: number
    is_joker: boolean
  }
}) {
  return (
    <div>
      <Link
        href={`/team/${slugifyTeam(pick.team_name)}`}
        className="inline-flex items-center gap-1.5 font-medium hover:underline"
      >
        <TeamBadge teamName={pick.team_name} size={16} />
        {pick.team_name}
      </Link>
      {pick.is_joker && (
        <span className="ml-2 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
          Joker
        </span>
      )}
      <div className="mt-0.5 text-xs text-zinc-500">
        {pick.distance == null
          ? 'No data'
          : pick.distance === 0
          ? '✓ exact'
          : `±${pick.distance}`}{' '}
        ·{' '}
        <span
          className={
            pick.points > 0
              ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
              : 'text-zinc-400'
          }
        >
          {pick.points} pts
        </span>
      </div>
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type SelectablePlayer = { display_name: string; invite_code: string }

export function CompareSelector({
  fromCode,
  players,
}: {
  fromCode: string
  players: SelectablePlayer[]
}) {
  const router = useRouter()
  const [target, setTarget] = useState('')

  const onChange = (code: string) => {
    setTarget(code)
    if (code) router.push(`/compare/${fromCode}/${code}`)
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <label
        htmlFor="compare-target"
        className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500"
      >
        Compare with
      </label>
      <select
        id="compare-target"
        value={target}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        <option value="">Choose a player…</option>
        {players
          .filter((p) => p.invite_code !== fromCode)
          .map((p) => (
            <option key={p.invite_code} value={p.invite_code}>
              {p.display_name}
            </option>
          ))}
      </select>
    </div>
  )
}

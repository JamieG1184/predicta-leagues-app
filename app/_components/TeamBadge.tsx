'use client'

import { useState } from 'react'
import { teamBadgeUrl } from '@/src/lib/team-badges'

type Props = {
  teamName: string
  size?: number
  className?: string
}

// Stable per-team color for the initials fallback so the same team always
// shows the same circle colour.
function colourFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  const palette = [
    '#dc2626', // red
    '#ea580c', // orange
    '#16a34a', // green
    '#0d9488', // teal
    '#0284c7', // sky
    '#4338ca', // indigo
    '#7c3aed', // purple
    '#c026d3', // fuchsia
    '#1d4ed8', // blue
    '#854d0e', // amber-darker
  ]
  return palette[hash % palette.length]
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].charAt(0).toUpperCase()
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase()
}

export function TeamBadge({ teamName, size = 18, className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  const url = teamBadgeUrl(teamName)

  if (!url || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.45),
          backgroundColor: colourFor(teamName),
        }}
        aria-hidden
      >
        {initials(teamName)}
      </span>
    )
  }

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 align-middle ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

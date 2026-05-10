// Live-projected leaderboard endpoint.
//
// Powers the homepage's opt-in "Live projection" toggle. Computes the
// leaderboard against the projected PL standings (actual + in-play match
// scores layered on as if those matches ended right now).
//
// Cache strategy: an in-memory cache scoped to this serverless instance keeps
// the projection result for ~30s. With 30 players (or even 200) on a single
// instance, this collapses concurrent client polls to one DB read each cache
// window. Across instances Vercel doesn't share — we accept the small extra
// cost; it's still bounded by the cache TTL.

import { NextResponse } from 'next/server'
import { getProjectedLeaderboard } from '@/src/lib/data'

export const dynamic = 'force-dynamic'

const CACHE_MS = 30_000
let cached: Awaited<ReturnType<typeof getProjectedLeaderboard>> | null = null
let cachedAt = 0

export async function GET() {
  try {
    const now = Date.now()
    if (cached && now - cachedAt < CACHE_MS) {
      return NextResponse.json({ ...cached, cached: true })
    }
    const result = await getProjectedLeaderboard()
    cached = result
    cachedAt = now
    return NextResponse.json({ ...result, cached: false })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}

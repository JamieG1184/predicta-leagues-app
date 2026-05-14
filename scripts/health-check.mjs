// Predicta Leagues — Pre-match health check.
//
// Quick green-light / red-flag report you run before kick-off to make sure
// production is healthy and ready to serve a live match. Verifies:
//
//   1. Production domain reachable
//   2. /api/live responds, returns valid JSON, and reflects recent activity
//   3. Supabase reachable + season/player/team data sane
//   4. Tonight's fixture is in the DB
//   5. Score-snapshot history is healthy (we can compute deltas)
//   6. Sportmonks API token is configured
//
// Run with:
//   npm run health-check
//
// Output: one line per check, ✓ for pass, ⚠ for warning, ✗ for fail.
// Exit code is 0 if all critical checks pass, 1 otherwise.

import { createClient } from '@supabase/supabase-js'

const PRODUCTION_URL = 'https://predicta-leagues.com'

const checks = []
let hadFail = false

function record(status, label, detail = '') {
  const icon = status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗'
  const tag =
    status === 'pass' ? '\x1b[32m' : status === 'warn' ? '\x1b[33m' : '\x1b[31m'
  const reset = '\x1b[0m'
  console.log(`${tag}${icon}${reset}  ${label.padEnd(48)} ${detail}`)
  checks.push({ status, label, detail })
  if (status === 'fail') hadFail = true
}

console.log('\n🏥  Predicta Leagues — pre-match health check')
console.log('────────────────────────────────────────────────────────────')

// 1. Production domain reachable
try {
  const t0 = Date.now()
  const res = await fetch(PRODUCTION_URL, { method: 'HEAD', redirect: 'manual' })
  const ms = Date.now() - t0
  if (res.status >= 200 && res.status < 400) {
    record('pass', 'Production site reachable', `${res.status} · ${ms}ms`)
  } else {
    record('fail', 'Production site reachable', `HTTP ${res.status}`)
  }
} catch (e) {
  record('fail', 'Production site reachable', e.message)
}

// 2. /api/live endpoint
let liveJson = null
try {
  const t0 = Date.now()
  const res = await fetch(`${PRODUCTION_URL}/api/live`, { cache: 'no-store' })
  const ms = Date.now() - t0
  if (!res.ok) {
    record('fail', '/api/live responding', `HTTP ${res.status}`)
  } else {
    liveJson = await res.json()
    record('pass', '/api/live responding', `200 · ${ms}ms`)
  }
} catch (e) {
  record('fail', '/api/live responding', e.message)
}

if (liveJson) {
  // Freshness
  const lastSync = liveJson.last_synced_at ? new Date(liveJson.last_synced_at) : null
  if (lastSync) {
    const ageS = Math.round((Date.now() - lastSync.getTime()) / 1000)
    if (ageS < 120) {
      record('pass', '/api/live freshness', `last sync ${ageS}s ago`)
    } else if (ageS < 600) {
      record('warn', '/api/live freshness', `last sync ${ageS}s ago — may be in cache`)
    } else {
      record('warn', '/api/live freshness', `last sync ${Math.round(ageS / 60)}m ago`)
    }
  }
  // Mode
  if (liveJson.idle) {
    record('pass', '/api/live mode', 'idle (no match window yet)')
  } else if (liveJson.has_live_matches) {
    record(
      'pass',
      '/api/live mode',
      `LIVE · ${liveJson.live_fixtures?.length ?? 0} match${liveJson.live_fixtures?.length === 1 ? '' : 'es'} in play`
    )
  } else {
    record('pass', '/api/live mode', 'match window open · standby')
  }
}

// 3. Supabase reachable + data sane
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

let seasonId = null
try {
  const { data: season, error } = await sb
    .from('seasons')
    .select('id, name')
    .eq('is_current', true)
    .single()
  if (error || !season) {
    record('fail', 'Supabase reachable + current season', error?.message ?? 'none')
  } else {
    seasonId = season.id
    record('pass', 'Supabase reachable + current season', season.name)
  }
} catch (e) {
  record('fail', 'Supabase reachable', e.message)
}

if (seasonId) {
  // Player + prediction counts
  const { count: playerCount } = await sb
    .from('players')
    .select('id', { count: 'exact', head: true })
  if (playerCount && playerCount >= 25) {
    record('pass', 'Players in DB', `${playerCount}`)
  } else {
    record('warn', 'Players in DB', `${playerCount} — expected ~30`)
  }

  const { count: predCount } = await sb
    .from('predictions')
    .select('player_id', { count: 'exact', head: true })
    .eq('season_id', seasonId)
  const expectedPreds = (playerCount ?? 0) * 20
  if (predCount === expectedPreds && expectedPreds > 0) {
    record(
      'pass',
      'Predictions per player',
      `${predCount} rows (${playerCount} × 20)`
    )
  } else {
    record(
      'warn',
      'Predictions per player',
      `${predCount} rows — expected ${expectedPreds}`
    )
  }

  // Jokers — each player should have exactly one
  const { data: jokers } = await sb
    .from('predictions')
    .select('player_id')
    .eq('season_id', seasonId)
    .eq('is_joker', true)
  const jokerCount = jokers?.length ?? 0
  if (jokerCount === playerCount) {
    record('pass', 'Jokers (one per player)', `${jokerCount}`)
  } else {
    record(
      'warn',
      'Jokers (one per player)',
      `${jokerCount} — expected ${playerCount}`
    )
  }

  // Tonight's fixture (next 12 hours)
  const now = new Date()
  const horizon = new Date(now.getTime() + 12 * 60 * 60 * 1000)
  const { data: tonightFixtures } = await sb
    .from('fixtures')
    .select('fixture_name, starting_at, state_id')
    .eq('season_id', seasonId)
    .gte('starting_at', now.toISOString())
    .lte('starting_at', horizon.toISOString())
    .order('starting_at', { ascending: true })
  if (tonightFixtures && tonightFixtures.length > 0) {
    for (const f of tonightFixtures) {
      const t = new Date(f.starting_at).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/London',
      })
      record('pass', 'Upcoming fixture (next 12h)', `${t} · ${f.fixture_name}`)
    }
  } else {
    record('warn', 'Upcoming fixture (next 12h)', 'none scheduled')
  }

  // Snapshot history
  const { data: snaps } = await sb
    .from('score_snapshots')
    .select('snapshot_at')
    .eq('season_id', seasonId)
    .order('snapshot_at', { ascending: false })
    .limit(1)
  if (snaps && snaps.length > 0) {
    const last = new Date(snaps[0].snapshot_at)
    const ageH = (Date.now() - last.getTime()) / 36e5
    if (ageH < 48) {
      record('pass', 'Latest snapshot', `${Math.round(ageH * 10) / 10}h ago`)
    } else {
      record(
        'warn',
        'Latest snapshot',
        `${Math.round(ageH / 24)}d ago — consider scores:calculate`
      )
    }
  } else {
    record('warn', 'Latest snapshot', 'no snapshots yet')
  }
}

// 4. Sportmonks token configured
if (process.env.SPORTMONKS_API_TOKEN) {
  record(
    'pass',
    'Sportmonks token configured',
    `${process.env.SPORTMONKS_API_TOKEN.slice(0, 8)}…`
  )
} else {
  record('fail', 'Sportmonks token configured', 'SPORTMONKS_API_TOKEN missing')
}

console.log('────────────────────────────────────────────────────────────')
const passes = checks.filter((c) => c.status === 'pass').length
const warns = checks.filter((c) => c.status === 'warn').length
const fails = checks.filter((c) => c.status === 'fail').length
console.log(`Summary: ${passes} pass · ${warns} warn · ${fails} fail\n`)

process.exit(hadFail ? 1 : 0)

// Hardcoded mapping of team slug → Sportmonks team ID, so we can build
// the official badge URL on the Sportmonks CDN without having to query
// our restricted /teams endpoint at runtime.

const SPORTMONKS_ID_BY_SLUG: Record<string, number> = {
  arsenal: 19,
  'aston-villa': 15,
  bournemouth: 52,
  brentford: 236,
  'brighton-and-hove-albion': 78,
  burnley: 27,
  chelsea: 18,
  'crystal-palace': 51,
  everton: 13,
  fulham: 11,
  'leeds-united': 71,
  liverpool: 8,
  'manchester-city': 9,
  'manchester-united': 14,
  'newcastle-united': 20,
  'nottingham-forest': 63,
  sunderland: 3,
  'tottenham-hotspur': 6,
  'west-ham-united': 1,
  'wolverhampton-wanderers': 29,
}

import { slugifyTeam } from './slugify'

export function teamBadgeUrl(teamName: string): string | null {
  const slug = slugifyTeam(teamName)
  const id = SPORTMONKS_ID_BY_SLUG[slug]
  if (!id) return null
  return `https://cdn.sportmonks.com/images/soccer/teams/${id % 100}/${id}.png`
}

import { NextResponse, type NextRequest } from 'next/server'

// Two-tier auth:
//   - SITE_PASSWORD gates the whole public site (set via /login).
//   - ADMIN_TOKEN gates the /admin/* section (set via /admin).
// An admin cookie is also accepted as site auth so admins don't have to
// log in twice.

const PUBLIC_SITE_PATHS = new Set(['/login', '/login/submit', '/login/logout'])
const PUBLIC_ADMIN_PATHS = new Set(['/admin', '/admin/login', '/admin/logout'])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Public site login pages — always allowed
  if (PUBLIC_SITE_PATHS.has(pathname)) return NextResponse.next()

  // 2. Admin section uses its own gate
  if (pathname.startsWith('/admin')) {
    if (PUBLIC_ADMIN_PATHS.has(pathname)) return NextResponse.next()
    const adminCookie = request.cookies.get('predicta_admin')?.value
    if (adminCookie && adminCookie === process.env.ADMIN_TOKEN) {
      return NextResponse.next()
    }
    const loginUrl = new URL('/admin', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 3. Public site: accept either a valid site cookie or a valid admin cookie
  const siteCookie = request.cookies.get('predicta_site')?.value
  const adminCookie = request.cookies.get('predicta_admin')?.value
  const validSite = siteCookie && siteCookie === process.env.SITE_PASSWORD
  const validAdmin = adminCookie && adminCookie === process.env.ADMIN_TOKEN
  if (validSite || validAdmin) return NextResponse.next()

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('redirect', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Skip Next.js internals and static assets, but gate everything else
  // — including API routes and the homepage.
  matcher: ['/((?!_next/|favicon|.*\\..*).*)'],
}

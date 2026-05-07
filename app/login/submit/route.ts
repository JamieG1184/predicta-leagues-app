import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const password = request.nextUrl.searchParams.get('password')
  const redirect = request.nextUrl.searchParams.get('redirect') ?? '/'

  if (password && password === process.env.SITE_PASSWORD) {
    const response = NextResponse.redirect(new URL(redirect, request.url))
    response.cookies.set('predicta_site', password, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })
    return response
  }

  return NextResponse.redirect(new URL('/login?error=invalid', request.url))
}

import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const redirect = request.nextUrl.searchParams.get('redirect') ?? '/admin/shifts'

  if (token && token === process.env.ADMIN_TOKEN) {
    const response = NextResponse.redirect(new URL(redirect, request.url))
    response.cookies.set('predicta_admin', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })
    return response
  }

  return NextResponse.redirect(new URL('/admin?error=invalid', request.url))
}

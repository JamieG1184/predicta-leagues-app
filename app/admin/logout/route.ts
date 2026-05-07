import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/admin', request.url))
  response.cookies.delete('predicta_admin')
  return response
}

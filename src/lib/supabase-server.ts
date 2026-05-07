// Server-side Supabase client for use in React Server Components and API routes.
// Uses the service role key, which bypasses Row Level Security — safe because
// this code only runs on the server, never in the browser.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  throw new Error(
    'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.'
  )
}

export const supabaseServer = createClient(url, serviceKey, {
  auth: { persistSession: false },
})

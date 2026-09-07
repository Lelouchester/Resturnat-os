import { createClient } from '@supabase/supabase-js'

// Populate these in a .env.local file — never commit real values.
// VITE_SUPABASE_URL=https://<project>.supabase.co
// VITE_SUPABASE_ANON_KEY=<anon key>
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev rather than silently querying an undefined client.
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — set them in .env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

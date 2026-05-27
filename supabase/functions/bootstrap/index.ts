import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildBootstrapResponse, type Tier } from '../_shared/tier.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // ASCII domain in code; tietomaapera.fi DNS-redirects to tietomaaperä.fi.
  const upgradeUrl = Deno.env.get('UPGRADE_URL') ?? 'https://tietomaapera.fi/pricing'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return json(buildBootstrapResponse('public', upgradeUrl))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('tier, email, company_name')
    .eq('id', user.id)
    .single()

  // Profile missing (race between signup trigger and first request) → fall back to registered
  const tier: Tier = (profile?.tier as Tier) ?? 'registered'

  return json(buildBootstrapResponse(tier, upgradeUrl, {
    id: user.id,
    email: profile?.email ?? user.email ?? '',
    company_name: profile?.company_name ?? undefined,
  }))
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

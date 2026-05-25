import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { TIER_HISTORY_MONTHS, UPGRADE_MESSAGES, type Tier } from '../_shared/tier.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TimeseriesPoint {
  date: string           // YYYY-MM-DD
  displacement_mm: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  // Path: /functions/v1/timeseries/:building_id
  const buildingId = new URL(req.url).pathname.split('/').at(-1)
  if (!buildingId) {
    return json({ error: 'building_id required' }, 400)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  )

  // ── Determine tier ──────────────────────────────────────────────
  let tier: Tier = 'public'
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tier')
      .eq('id', user.id)
      .single()
    tier = (profile?.tier as Tier) ?? 'registered'
  }

  // ── Fetch from R2 ───────────────────────────────────────────────
  // Data is newline-delimited JSON produced by etl/src/export_parquet.py.
  // Partition key = first 2 chars of building_id.
  // TODO: wire up once ETL produces output (Day 1 task).
  let allData: TimeseriesPoint[] = []

  const r2BaseUrl = Deno.env.get('R2_PUBLIC_URL')
  if (r2BaseUrl) {
    try {
      const partition = buildingId.slice(0, 2)
      const res = await fetch(`${r2BaseUrl}/timeseries/turku/${partition}/${buildingId}.json`)
      if (res.ok) {
        allData = await res.json() as TimeseriesPoint[]
      }
    } catch {
      // R2 unavailable or file not yet produced — return empty data, not an error
    }
  }

  // ── Server-side trim — CRITICAL paywall boundary ────────────────
  // The full dataset must NEVER reach the browser for non-paying tiers.
  const monthLimit = TIER_HISTORY_MONTHS[tier]
  let returnData = allData
  let trimmed = false

  if (monthLimit !== null && allData.length > 0) {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - monthLimit)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    returnData = allData.filter((d) => d.date >= cutoffStr)
    trimmed = returnData.length < allData.length
  }

  return json({
    status: trimmed ? (tier === 'public' ? 'limited' : 'partial') : 'success',
    tier,
    building_id: buildingId,
    data: returnData,
    ...(trimmed && {
      paywall_triggered: true,
      upgrade_message: UPGRADE_MESSAGES[tier],
      total_available_observations: allData.length,
    }),
  })
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

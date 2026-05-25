import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildBootstrapResponse } from '../_shared/tier.ts'

const UPGRADE_URL = 'https://maapera.fi/pricing'

Deno.test('public tier — unauthenticated, Turku only, no features', () => {
  const res = buildBootstrapResponse('public', UPGRADE_URL)

  assertEquals(res.authenticated, false)
  assertEquals(res.tier, 'public')
  assertEquals(res.user, undefined)
  assertEquals(res.allowed_cities, ['turku'])
  assertEquals(res.features.full_timeseries, false)
  assertEquals(res.features.pdf_export, false)
  assertEquals(res.features.csv_export, false)
  assertEquals(res.features.alerts_enabled, false)
  assertEquals(res.features.multi_property_tracking, false)
  assertEquals(res.features.api_access, false)
  assertEquals(res.limits.max_tracked, 0)
  assertEquals(res.limits.max_reports_per_month, 0)
})

Deno.test('registered tier — authenticated, all cities, limited features', () => {
  const user = { id: 'uuid-1', email: 'testi@example.com' }
  const res = buildBootstrapResponse('registered', UPGRADE_URL, user)

  assertEquals(res.authenticated, true)
  assertEquals(res.tier, 'registered')
  assertEquals(res.user, user)
  assertEquals(res.allowed_cities, ['all'])
  assertEquals(res.features.full_timeseries, false)
  assertEquals(res.features.pdf_export, false)
  assertEquals(res.features.alerts_enabled, false)
  assertEquals(res.features.api_access, false)
  assertEquals(res.limits.max_tracked, 1)
  assertEquals(res.limits.max_reports_per_month, 0)
})

Deno.test('pro tier — full features except API access', () => {
  const user = { id: 'uuid-2', email: 'pro@isannointi.fi', company_name: 'Isännöinti Oy' }
  const res = buildBootstrapResponse('pro', UPGRADE_URL, user)

  assertEquals(res.authenticated, true)
  assertEquals(res.tier, 'pro')
  assertEquals(res.user, user)
  assertEquals(res.allowed_cities, ['all'])
  assertEquals(res.features.full_timeseries, true)
  assertEquals(res.features.pdf_export, true)
  assertEquals(res.features.csv_export, true)
  assertEquals(res.features.alerts_enabled, true)
  assertEquals(res.features.multi_property_tracking, true)
  assertEquals(res.features.api_access, false)   // enterprise only
  assertEquals(res.limits.max_tracked, 50)
  assertEquals(res.limits.max_reports_per_month, 20)
  assertEquals(res.paywall_copy.upgrade_cta_text, '')
})

Deno.test('enterprise tier — all features, unlimited limits', () => {
  const user = { id: 'uuid-3', email: 'admin@kunta.fi' }
  const res = buildBootstrapResponse('enterprise', UPGRADE_URL, user)

  assertEquals(res.features.api_access, true)
  assertEquals(res.limits.max_tracked, -1)
  assertEquals(res.limits.max_reports_per_month, -1)
})

Deno.test('paywall copy — correct CTA per tier', () => {
  const pub = buildBootstrapResponse('public', UPGRADE_URL)
  const reg = buildBootstrapResponse('registered', UPGRADE_URL)
  const pro = buildBootstrapResponse('pro', UPGRADE_URL)

  assertEquals(pub.paywall_copy.upgrade_url, UPGRADE_URL)
  assertEquals(pub.paywall_copy.upgrade_cta_text.length > 0, true)
  assertEquals(reg.paywall_copy.upgrade_cta_text.length > 0, true)
  assertEquals(pro.paywall_copy.upgrade_cta_text, '')  // already on paid tier
})

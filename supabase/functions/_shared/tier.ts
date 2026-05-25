// Shared tier logic — imported by bootstrap and timeseries functions.
// Pure TypeScript, no Deno-specific imports, so it's trivially testable.

export type Tier = 'public' | 'registered' | 'pro' | 'enterprise'

export interface BootstrapResponse {
  authenticated: boolean
  tier: Tier
  user?: { id: string; email: string; company_name?: string }
  allowed_cities: string[]
  features: {
    full_timeseries: boolean
    pdf_export: boolean
    csv_export: boolean
    alerts_enabled: boolean
    multi_property_tracking: boolean
    api_access: boolean
  }
  limits: {
    max_tracked: number          // -1 = unlimited
    max_reports_per_month: number
  }
  paywall_copy: {
    upgrade_cta_text: string
    upgrade_url: string
  }
}

export function buildBootstrapResponse(
  tier: Tier,
  upgradeUrl: string,
  user?: { id: string; email: string; company_name?: string },
): BootstrapResponse {
  const isPaid = tier === 'pro' || tier === 'enterprise'

  const features = {
    full_timeseries: isPaid,
    pdf_export: isPaid,
    csv_export: isPaid,
    alerts_enabled: isPaid,
    multi_property_tracking: isPaid,
    api_access: tier === 'enterprise',
  }

  const limits = {
    max_tracked:
      tier === 'public'      ? 0
      : tier === 'registered' ? 1
      : tier === 'pro'        ? 50
      : -1,
    max_reports_per_month:
      tier === 'pro'        ? 20
      : tier === 'enterprise' ? -1
      : 0,
  }

  const cta: Record<Tier, string> = {
    public:     'Rekisteröidy ilmaiseksi — katso 3 vuoden historia',
    registered: 'Päivitä Pro — täysi historia vuodesta 2018, PDF-raportit ja hälytykset',
    pro:        '',
    enterprise: '',
  }

  return {
    authenticated: tier !== 'public',
    tier,
    user,
    allowed_cities: tier === 'public' ? ['turku'] : ['all'],
    features,
    limits,
    paywall_copy: {
      upgrade_cta_text: cta[tier],
      upgrade_url: upgradeUrl,
    },
  }
}

// Maximum months of timeseries history the tier may receive (null = full 2018→)
export const TIER_HISTORY_MONTHS: Record<Tier, number | null> = {
  public:     12,
  registered: 36,
  pro:        null,
  enterprise: null,
}

export const UPGRADE_MESSAGES: Record<Tier, string> = {
  public:     'Rekisteröidy ilmaiseksi nähdäksesi 3 vuoden historia',
  registered: 'Päivitä Pro-tilille saadaksesi koko historia vuodesta 2018',
  pro:        '',
  enterprise: '',
}

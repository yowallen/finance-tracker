/**
 * Preview-only features shown on local hosts, hidden on deployed sites.
 * Hostname-based so production builds still hide them on GitHub Pages / hosting.
 */
export function isLocalhostPreviewHost(hostname = typeof window !== 'undefined' ? window.location.hostname : ''): boolean {
  return (
    hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]'
    || hostname.endsWith('.localhost')
  )
}

export const FEATURE_FLAGS = {
  paydayBudget: isLocalhostPreviewHost(),
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag]
}

// Stable, human-friendly report identifier: MAA-YYYY-MM-DD-XXXXX.
//
// The suffix is a deterministic short hash of building_id + report date,
// so re-running a report on the same day for the same building yields
// the same ID. That property matters for audit trails and customer
// support ("send me your report ID").

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  // skip I, O, 0, 1 for readability

export function generateReportId(buildingId: string, generatedAt: Date): string {
  const yyyy = generatedAt.getFullYear()
  const mm = String(generatedAt.getMonth() + 1).padStart(2, '0')
  const dd = String(generatedAt.getDate()).padStart(2, '0')
  const seed = `${buildingId}|${yyyy}-${mm}-${dd}`
  const suffix = shortHash(seed, 5)
  return `MAA-${yyyy}-${mm}-${dd}-${suffix}`
}

function shortHash(input: string, length: number): string {
  // FNV-1a 32-bit, then base32 over our custom alphabet. Stable across
  // JS runtimes and deterministic, which is all we need here.
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[h % ALPHABET.length]
    h = Math.floor(h / ALPHABET.length) || 0x9e3779b1
  }
  return out
}

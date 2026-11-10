/**
 * Reserved platform identity limiter for QORVEXA.
 * Protects brand and administrative identifiers ('QORVEXA', 'QORVEXA Admin', 'Admin', etc.)
 * from being used by regular users, reserving them exclusively for the platform owner / super administrators.
 */

function normalize(str) {
  if (!str) return ''
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Checks if a candidate username is reserved.
 * Usernames follow ^[a-z0-9_]{3,24}$ in QORVEXA.
 */
export function isReservedUsername(username) {
  if (!username) return false
  const raw = String(username).trim().toLowerCase()
  const clean = normalize(raw)

  // 1. Brand name protection: Any username containing 'qorvexa'
  if (raw.includes('qorvexa') || clean.includes('qorvexa')) {
    return true
  }

  // 2. Administrator variations
  if (clean === 'admin' || clean === 'administrator' || clean === 'sysadmin') {
    return true
  }

  // Prefix checks: admin_*, admin[0-9]*, administrator_*
  if (/^admin(_|[0-9]|$)/.test(raw) || /^administrator(_|[0-9]|$)/.test(raw)) {
    return true
  }

  // Suffix checks: *_admin, *_administrator
  if (/(_|^)admin$/.test(raw) || /(_|^)administrator$/.test(raw)) {
    return true
  }

  // Combinations like qorvexaadmin, adminqorvexa
  if (clean.includes('admin') && clean.includes('qorvexa')) {
    return true
  }

  return false
}

/**
 * Checks if a candidate display name is reserved.
 * Display names are 2 to 60 characters.
 */
export function isReservedDisplayName(displayName) {
  if (!displayName) return false
  const raw = String(displayName).trim()
  const clean = normalize(raw)

  // 1. Brand name protection: Contains 'qorvexa' (with or without spaces, dots, dashes)
  if (/qorvexa/i.test(raw) || clean.includes('qorvexa')) {
    return true
  }

  // 2. Admin / Administrator protection:
  // Word boundary matching (prevents false positives like Vladimir or Badminton)
  if (/\b(admin|administrator|sysadmin)\b/i.test(raw)) {
    return true
  }

  // Normalized exact or prefix/suffix checks
  if (clean === 'admin' || clean === 'administrator' || clean === 'sysadmin') {
    return true
  }

  if (/^admin[0-9]*$/.test(clean) || /^administrator[0-9]*$/.test(clean)) {
    return true
  }

  return false
}

/**
 * Convenience function to check either username or display name
 */
export function isReservedIdentity(val) {
  return isReservedUsername(val) || isReservedDisplayName(val)
}

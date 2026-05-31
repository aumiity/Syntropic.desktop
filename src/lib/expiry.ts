// Expiry alert thresholds — fixed by policy, NOT user-editable.
// warn   = product turns "near expiry" (yellow) when remaining shelf life drops below this.
// danger = product turns "critical" (orange) below this.
// Both are in months. This is the single source of truth: POS cart alerts
// (cartAlerts.ts), the POS search-dialog legend (POS/index.tsx) and the Settings
// legend (SalesTab) all import from here, so changing the policy means editing one place.
export const EXPIRY_WARN_MONTHS = 6
export const EXPIRY_DANGER_MONTHS = 3

import { api, session } from './api';

export const UPSELL_EVENT = 'rr.upsell.show';
export const FORECAST_DAYS_FREE = 3;
export const FORECAST_DAYS_PRO = 5;
export const BILLING_URL = 'https://rootrecord.info/billing';

export function hasProAccess() {
  return session.isPro() || session.isLifeMember();
}

export function getMemberTier() {
  if (session.isLifeMember()) return 'lifetime';
  if (session.isPro()) return 'pro';
  return 'free';
}

export function memberStatusLabel() {
  const tier = getMemberTier();
  if (tier === 'lifetime') return 'Lifetime member';
  if (tier === 'pro') return 'Pro member';
  return 'Free';
}

export function memberStatusHint() {
  const tier = getMemberTier();
  if (tier === 'lifetime' || tier === 'pro') return 'All features enabled · NOAA push alerts on Android';
  return '3-day forecast · hazard tabs · upgrade for live data, air quality & push alerts';
}

export function forecastDayLimit() {
  return hasProAccess() ? FORECAST_DAYS_PRO : FORECAST_DAYS_FREE;
}

export function showUpsellModal() {
  try {
    window.dispatchEvent(new Event(UPSELL_EVENT));
  } catch {
    /* ignore */
  }
}

/** Refresh Pro / Lifetime flags from the server (e.g. after billing changes). */
export async function refreshSessionAccess() {
  if (!session.isAuthed()) return;
  try {
    const { data } = await api.me();
    session.setAccess(Boolean(data?.pro_unlocked), Boolean(data?.life_member));
  } catch {
    /* offline — keep cached tier */
  }
}

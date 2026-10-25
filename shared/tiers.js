// VIP tiers and rebates. Rebate = share of the house edge on every settled bet, accrued and claimable.
// The numbers are the lesson: even Diamond returns 15% of what the edge takes, and only after the edge is taken.
export const TIERS = [
  { id: 'bronze', name: 'Bronze', threshold: 0, rate: 0, bonus: 0, colour: '#b87333' },
  { id: 'silver', name: 'Silver', threshold: 1_000, rate: 0.05, bonus: 10, colour: '#c0c7d1' },
  { id: 'gold', name: 'Gold', threshold: 5_000, rate: 0.075, bonus: 50, colour: '#f5ac37' },
  { id: 'platinum', name: 'Platinum', threshold: 25_000, rate: 0.10, bonus: 250, colour: '#8fd3ff' },
  { id: 'diamond', name: 'Diamond', threshold: 100_000, rate: 0.15, bonus: 1_000, colour: '#b9a7ff' },
];
export const tierFor = (wageredAgt) => [...TIERS].reverse().find((t) => wageredAgt >= t.threshold) || TIERS[0];
export const tierById = (id) => TIERS.find((t) => t.id === id) || TIERS[0];
export const nextTier = (id) => { const i = TIERS.findIndex((t) => t.id === id); return TIERS[i + 1] || null; };

// Timed bonus drips: a slice of what you wagered in the window, claimable once per window.
// Use it or lose it, like the real ones: the design brings you back on the hour, not the maths.
export const DRIPS = {
  hourly: { label: 'Hourly reload', windowMs: 3600e3, rate: 0.005, min: 0.1, max: 50, blurb: '0.5% of what you wagered in the last hour.' },
  daily: { label: 'Daily bonus', windowMs: 86400e3, rate: 0.0075, min: 0.5, max: 250, blurb: '0.75% of what you wagered in the last 24 hours.' },
  weekly: { label: 'Weekly bonus', windowMs: 7 * 86400e3, rate: 0.01, min: 1, max: 1000, blurb: '1% of what you wagered in the last 7 days.' },
};
export const DRIP_IDS = Object.keys(DRIPS);
/** Bonus in AGT for `wageredAgt` inside the window; 0 when nothing was wagered. */
export const dripAmount = (kind, wageredAgt) => { const d = DRIPS[kind]; if (!d || wageredAgt <= 0) return 0; return Math.round(Math.min(d.max, Math.max(d.min, wageredAgt * d.rate)) * 100) / 100; };

// The chest: opens every six hours, pays a random slice of what you wagered since it last opened.
// Random size and a timer are the two oldest hooks in the business; the expected value is printed next to it.
export const CHEST = { windowMs: 6 * 3600e3, fillAt: 500, minRate: 0.003, maxRate: 0.012, min: 0.25, max: 150 };
export const chestExpected = (wageredAgt) => (wageredAgt <= 0 ? 0 : Math.round(Math.min(CHEST.max, Math.max(CHEST.min, wageredAgt * (CHEST.minRate + CHEST.maxRate) / 2)) * 100) / 100);
export const chestAmount = (wageredAgt, roll) => (wageredAgt <= 0 ? 0 : Math.round(Math.min(CHEST.max, Math.max(CHEST.min, wageredAgt * (CHEST.minRate + roll * (CHEST.maxRate - CHEST.minRate)))) * 100) / 100);

// Referrals: the friend gets a welcome boost, the referrer gets a cut of the edge the friend pays. Affiliate maths, labelled.
export const REFERRAL = { bonus: 50, rate: 0.10, minClaim: 1 };

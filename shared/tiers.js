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

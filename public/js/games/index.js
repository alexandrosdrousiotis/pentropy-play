// Game catalog. Engines live on the server; these modules only render and send actions.
export const CATEGORIES = [
  { id: 'originals', label: 'Originals' },
  { id: 'chains', label: 'Streak games' },
  { id: 'table', label: 'Table games' },
];
export const CATALOG = [
  { id: 'limbo', name: 'Limbo', cat: 'originals', tagline: 'Name a multiplier', rtp: 0.99, ceiling: '1,000,000x', blurb: 'Pick a target. Beat it.', load: () => import('./limbo.js') },
  { id: 'mines', name: 'Mines', cat: 'originals', tagline: 'Twenty-five tiles', rtp: 0.99, ceiling: '5,148,297x', blurb: 'Find gems. Avoid mines.', load: () => import('./mines.js') },
  { id: 'dice', name: 'Dice', cat: 'originals', tagline: 'Fully adjustable odds', rtp: 0.99, ceiling: '9,900x', blurb: 'Set your odds. Roll.', load: () => import('./dice.js') },
  { id: 'crash', name: 'Crash', cat: 'originals', tagline: 'Hold your nerve', rtp: 0.99, ceiling: '1,000,000x', blurb: 'Cash out before it crashes.', load: () => import('./crash.js') },
  { id: 'tower', name: 'Dragon Tower', cat: 'originals', tagline: 'Nine rows up', rtp: 0.98, ceiling: '256,901x', blurb: 'Climb nine rows of eggs.', load: () => import('./tower.js') },
  { id: 'plinko', name: 'Plinko', cat: 'originals', tagline: 'Drop and pray', rtp: 0.99, ceiling: '10,000x', blurb: 'Drop the ball.', load: () => import('./plinko.js') },
  { id: 'keno', name: 'Keno', cat: 'originals', tagline: 'Pick up to ten', rtp: 0.99, ceiling: '1,000x', blurb: 'Pick up to ten numbers.', load: () => import('./keno.js') },
  { id: 'wheel', name: 'Wheel', cat: 'originals', tagline: 'Spin', rtp: 0.99, ceiling: '49.5x', blurb: 'Pick a risk. Spin.', load: () => import('./wheel.js') },
  { id: 'slide', name: 'Slide', cat: 'originals', tagline: 'Limbo on a strip', rtp: 0.99, ceiling: '1,000,000x', blurb: 'Pick a target. Watch it slide.', load: () => import('./slide.js') },
  { id: 'diamonds', name: 'Diamonds', cat: 'originals', tagline: 'Five gems', rtp: 0.99, ceiling: '50x', blurb: 'Match five gems.', load: () => import('./diamonds.js') },
  { id: 'chicken', name: 'Chicken', cat: 'chains', tagline: 'Cross the road', rtp: 0.99, ceiling: '3,236,072x', blurb: 'Cross 25 lanes. Cash out any time.', load: () => import('./chicken.js') },
  { id: 'pump', name: 'Pump', cat: 'chains', tagline: 'Inflate the balloon', rtp: 0.99, ceiling: '3,236,072x', blurb: 'Pump. Cash out before it pops.', load: () => import('./pump.js') },
  { id: 'hilo', name: 'HiLo', cat: 'chains', tagline: 'Higher or lower', rtp: 0.99, ceiling: '100,000x', blurb: 'Higher or lower.', load: () => import('./hilo.js') },
  { id: 'flip', name: 'Flip', cat: 'chains', tagline: 'Heads or tails', rtp: 0.99, ceiling: '100,000x', blurb: 'Call the coin. Double up.', load: () => import('./flip.js') },
  { id: 'rps', name: 'Rock Paper Scissors', cat: 'chains', tagline: 'Best the house', rtp: 0.99, ceiling: '100,000x', blurb: 'Win a throw. Double up.', load: () => import('./rps.js') },
  { id: 'blackjack', name: 'Blackjack', cat: 'table', tagline: 'Dealer stands on 17', rtp: 0.9943, ceiling: '2.5x', blurb: 'Dealer stands on 17.', load: () => import('./blackjack.js') },
  { id: 'videopoker', name: 'Video Poker', cat: 'table', tagline: '9/6 Jacks or Better', rtp: 0.9954, ceiling: '800x', blurb: '9/6 Jacks or Better.', load: () => import('./videopoker.js') },
  { id: 'baccarat', name: 'Baccarat', cat: 'table', tagline: 'Player, banker or tie', rtp: 0.9894, ceiling: '9x', blurb: 'Player, banker or tie.', load: () => import('./baccarat.js') },
  { id: 'roulette', name: 'Roulette', cat: 'table', tagline: 'Single zero', rtp: 0.973, ceiling: '36x', blurb: 'European. Single zero.', load: () => import('./roulette.js') },
];
export const gameById = (id) => CATALOG.find((g) => g.id === id);
export const GAME_ICON = { limbo: 'ph-rocket-launch', mines: 'ph-bomb', dice: 'ph-dice-five', crash: 'ph-trend-up', tower: 'ph-egg', hilo: 'ph-cards', plinko: 'ph-circles-four', keno: 'ph-dots-nine', videopoker: 'ph-club', blackjack: 'ph-spade', chicken: 'ph-bird', pump: 'ph-balloon', flip: 'ph-coin', rps: 'ph-hand-fist', slide: 'ph-sliders-horizontal', wheel: 'ph-aperture', baccarat: 'ph-cards-three', roulette: 'ph-disc', diamonds: 'ph-diamonds-four' };
export const GAME_COLOR = { limbo: '#1d4ed8', mines: '#3f3f46', dice: '#4338ca', crash: '#be123c', tower: '#047857', hilo: '#9f1239', plinko: '#0369a1', keno: '#b45309', videopoker: '#0f766e', blackjack: '#a16207', chicken: '#c2410c', pump: '#db2777', flip: '#ca8a04', rps: '#7c3aed', slide: '#0e7490', wheel: '#9333ea', baccarat: '#166534', roulette: '#991b1b', diamonds: '#0891b2' };

/** Game ids that have artwork at public/art/<id>.webp. Add an id here after dropping the file in. */
export const ART = new Set(['roulette']);
/** Wide 2:1 banners at public/art/<id>-banner.webp for the featured cards. */
export const BANNERS = new Set(['roulette']);

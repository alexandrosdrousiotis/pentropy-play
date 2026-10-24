// Game catalog. Engines live on the server; these modules only render and send actions.
export const CATALOG = [
  { id: 'limbo', name: 'Limbo', tagline: 'Name a multiplier', rtp: 0.99, ceiling: '1,000,000x', toy: 'rocket', blurb: 'Pick a target. Beat it.', load: () => import('./limbo.js') },
  { id: 'mines', name: 'Mines', tagline: 'Twenty-five tiles', rtp: 0.99, ceiling: '5,148,297x', toy: 'bomb', blurb: 'Find gems. Avoid mines.', load: () => import('./mines.js') },
  { id: 'dice', name: 'Dice', tagline: 'Fully adjustable odds', rtp: 0.99, ceiling: '9,900x', toy: 'dice', blurb: 'Set your odds. Roll.', load: () => import('./dice.js') },
  { id: 'crash', name: 'Crash', tagline: 'Hold your nerve', rtp: 0.99, ceiling: '1,000,000x', toy: 'flame', blurb: 'Cash out before it crashes.', load: () => import('./crash.js') },
  { id: 'tower', name: 'Dragon Tower', tagline: 'Nine rows up', rtp: 0.98, ceiling: '256,901x', toy: 'dragon', blurb: 'Climb nine rows of eggs.', load: () => import('./tower.js') },
  { id: 'hilo', name: 'HiLo', tagline: 'Higher or lower', rtp: 0.99, ceiling: '100,000x', toy: 'card', blurb: 'Higher or lower.', load: () => import('./hilo.js') },
  { id: 'plinko', name: 'Plinko', tagline: 'Drop and pray', rtp: 0.99, ceiling: '10,000x', toy: 'plinko', blurb: 'Drop the ball.', load: () => import('./plinko.js') },
  { id: 'keno', name: 'Keno', tagline: 'Pick up to ten', rtp: 0.99, ceiling: '1,000x', toy: 'keno', blurb: 'Pick up to ten numbers.', load: () => import('./keno.js') },
  { id: 'videopoker', name: 'Video Poker', tagline: '9/6 Jacks or Better', rtp: 0.9954, ceiling: '800x', toy: 'gem', blurb: '9/6 Jacks or Better.', load: () => import('./videopoker.js') },
  { id: 'blackjack', name: 'Blackjack', tagline: 'Dealer stands on 17', rtp: 0.9943, ceiling: '2.5x', toy: 'chip', blurb: 'Dealer stands on 17.', load: () => import('./blackjack.js') },
];
export const gameById = (id) => CATALOG.find((g) => g.id === id);

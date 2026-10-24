// Game catalog. Engines live on the server; these modules only render and send actions.
export const CATALOG = [
  { id: 'limbo', name: 'Limbo', tagline: 'Name a multiplier', rtp: 0.99, ceiling: '1,000,000x', toy: 'rocket', blurb: 'Pick a target. The round picks a number. 1% of rounds bust at 1.00x no matter what.', load: () => import('./limbo.js') },
  { id: 'mines', name: 'Mines', tagline: 'Twenty-five tiles', rtp: 0.99, ceiling: '5,148,297x', toy: 'bomb', blurb: 'Reveal gems, avoid mines, cash out when your nerve runs out. You set the odds with the mine count.', load: () => import('./mines.js') },
  { id: 'dice', name: 'Dice', tagline: 'Fully adjustable odds', rtp: 0.99, ceiling: '9,900x', toy: 'dice', blurb: 'Choose your win chance from 0.01% to 98%. The multiplier is always 99 divided by that chance.', load: () => import('./dice.js') },
  { id: 'crash', name: 'Crash', tagline: 'Hold your nerve', rtp: 0.99, ceiling: '1,000,000x', toy: 'flame', blurb: 'A multiplier climbs until it crashes. Cash out before it does. The server clock decides.', load: () => import('./crash.js') },
  { id: 'tower', name: 'Dragon Tower', tagline: 'Nine rows up', rtp: 0.98, ceiling: '256,901x', toy: 'dragon', blurb: 'Climb nine rows of eggs. Harder difficulties mean fewer safe tiles and a steeper ladder.', load: () => import('./tower.js') },
  { id: 'hilo', name: 'HiLo', tagline: 'Higher or lower', rtp: 0.99, ceiling: '100,000x', toy: 'card', blurb: 'Call the next card. Every correct call compounds the multiplier; one wrong call ends it.', load: () => import('./hilo.js') },
  { id: 'plinko', name: 'Plinko', tagline: 'Drop and pray', rtp: 0.99, ceiling: '10,000x', toy: 'plinko', blurb: 'A ball bounces down 8 to 16 rows of pegs. The edge bins pay big because almost nothing lands there.', load: () => import('./plinko.js') },
  { id: 'keno', name: 'Keno', tagline: 'Pick up to ten', rtp: 0.99, ceiling: '1,000x', toy: 'keno', blurb: 'Choose numbers from 40, ten are drawn. The pay table rewards hits and punishes everything else.', load: () => import('./keno.js') },
  { id: 'videopoker', name: 'Video Poker', tagline: '9/6 Jacks or Better', rtp: 0.9954, ceiling: '800x', toy: 'gem', blurb: 'The best odds of any skill game. Perfect play returns 99.54%; most people play far from perfectly.', load: () => import('./videopoker.js') },
  { id: 'blackjack', name: 'Blackjack', tagline: 'Dealer stands on 17', rtp: 0.9943, ceiling: '2.5x', toy: 'chip', blurb: 'Highest RTP of all, smallest ceiling of all. The house still wins 0.57 of every 100 wagered.', load: () => import('./blackjack.js') },
];
export const gameById = (id) => CATALOG.find((g) => g.id === id);

// Simulated players for the live feed, shared by the server and the browser demo.
// They exist so the room never looks empty and are always flagged `bot: true` on the wire:
// real sites fill their feeds the same way and never tell you which rows are real.
const HANDLES = ['nova_77', 'kryptoKid', 'Lena.M', 'spin_doctor', 'tomo', 'Mx_Riggs', 'pepperoni', 'dasha', 'ghostline', 'Yuki__', 'oldmate', 'fenwick', 'z3r0', 'Marisol', 'bigtony', 'quietfox', 'Aurel', 'nightshift', 'sven_k', 'juju', 'Tariq', 'holdmybeer', 'cass', 'Ingrid', 'moonboy', 'rafa', 'Dot', 'blue_velvet', 'kiki', 'Oskar'];
export const BOT_GAMES = ['crash', 'dice', 'mines', 'plinko', 'limbo', 'roulette', 'chicken', 'wheel', 'keno', 'slide', 'blackjack', 'tower', 'pump', 'flip', 'diamonds', 'hilo', 'baccarat', 'rps', 'videopoker'];
const round2 = (x) => Math.round(x * 100) / 100;

/** One simulated settled bet. Fair odds: the player picks a target, the point beats it 0.99/target of the time. */
export function botRound(rand = Math.random, at = Date.now()) {
  const handle = HANDLES[Math.floor(rand() * HANDLES.length)];
  const game = BOT_GAMES[Math.floor(rand() * BOT_GAMES.length)];
  const amount = round2(Math.exp(Math.log(0.5) + rand() * (Math.log(800) - Math.log(0.5))));
  const target = round2(1.05 + rand() ** 2.2 * 12);
  const point = 0.99 / (1 - rand());
  const multiplier = point >= target ? target : 0;
  const payout = round2(amount * multiplier);
  return { id: `b${at}${Math.floor(rand() * 1000)}`, at, username: handle, bot: true, game, amount, multiplier, payout, net: round2(payout - amount) };
}
export const BOT_HANDLES = HANDLES;

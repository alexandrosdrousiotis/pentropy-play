import { mountChain } from './chain.js';
export function mount(root, meta) {
  return mountChain(root, meta, { id: 'flip', action: 'flip', choices: ['heads', 'tails'], icons: { idle: 'ph-coin', heads: 'ph-crown', tails: 'ph-coin' }, historyKey: 'flips', resultOf: (x) => (x.ok ? 'win' : 'lose'), labelOf: (x) => `${x.choice[0].toUpperCase()}→${x.result[0].toUpperCase()}`, startLabel: 'Start' });
}

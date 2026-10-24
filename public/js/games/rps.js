import { mountChain } from './chain.js';
export function mount(root, meta) {
  return mountChain(root, meta, { id: 'rps', action: 'throw', choices: ['rock', 'paper', 'scissors'], icons: { idle: 'ph-hand-fist', rock: 'ph-hand-fist', paper: 'ph-cards', scissors: 'ph-x' }, historyKey: 'rounds', resultOf: (x) => x.result, labelOf: (x) => `${x.pick[0].toUpperCase()} v ${x.house[0].toUpperCase()}`, startLabel: 'Start' });
}

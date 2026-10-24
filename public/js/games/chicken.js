import { mountTrack } from './track.js';
import { CHICKEN_LEVELS } from '../../shared/math.js';
export function mount(root, meta) { return mountTrack(root, meta, { id: 'chicken', levels: CHICKEN_LEVELS, stepAction: 'step', unit: 'lane', bustKey: 'hit', stepLabel: 'Cross', hazardIcon: 'ph-fire', safeIcon: 'ph-bird' }); }

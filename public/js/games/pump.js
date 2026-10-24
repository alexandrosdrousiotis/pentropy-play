import { mountTrack } from './track.js';
import { PUMP_LEVELS } from '../../shared/math.js';
export function mount(root, meta) { return mountTrack(root, meta, { id: 'pump', levels: PUMP_LEVELS, stepAction: 'pump', unit: 'pumps', bustKey: 'popped', stepLabel: 'Pump', hazardIcon: 'ph-skull', safeIcon: 'ph-balloon' }); }

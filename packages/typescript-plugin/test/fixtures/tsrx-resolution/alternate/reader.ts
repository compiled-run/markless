import { MeterTrack } from './index.ts';
import type { MeterTrackProps } from './Meter.tsrx';

// Same structure, different names, a star re-export and an upper-case module file.
export const unit: MeterTrackProps['unit'] = 'ratio';
export const level: Parameters<typeof MeterTrack>[0]['level'] = 0.5;

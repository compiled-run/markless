import type { Children } from '@markless/core';

export type MeterTrackProps = {
	readonly level: number;
	readonly unit?: 'percent' | 'ratio';
	readonly children?: Children;
};

export function MeterTrack({ level, unit = 'percent', children }: MeterTrackProps) @{
	<div role="meter" aria-valuenow={level} data-unit={unit}>{children}</div>
}

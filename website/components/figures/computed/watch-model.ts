// The Computed figure's values: the run's distance and time, the pace worked out from them, and what the live region says.
export const START = { km: 5, minutes: 25 } as const;
export const KM = { min: 1, max: 21 } as const;
export const MINUTES = { min: 10, max: 120 } as const;
/** Pixels of vertical drag per step of a readout's dial. */
export const DIAL_STEP = 9;

export const clampTo = (range: { min: number; max: number }, n: number) => Math.max(range.min, Math.min(range.max, n));
export const dial = (range: { min: number; max: number }, from: number, startY: number, nowY: number) =>
	clampTo(range, from + Math.round((startY - nowY) / DIAL_STEP));
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

/** Minutes per kilometre, to one decimal, as the watch prints it. */
export const paceOf = (minutes: number, km: number) => (minutes / km).toFixed(1);

export function describePace(km: number, minutes: number): string {
	return `${km} km in ${minutes} minutes, so pace is ${paceOf(minutes, km)} minutes per km.`;
}

export const REFUSED = 'pace is worked out from minutes and km. The watch won’t let you set it.';

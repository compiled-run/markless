// The Computed chain figure's values: the mercury's °C, the °F worked out from it, the advice worked out from °F, and what the live region says.
export const START = 5;
export const RANGE = { min: -10, max: 35 } as const;
/** Pixels of vertical drag per degree. */
export const DIAL_STEP = 5;
export const TUBE = { top: 42, bottom: 232 } as const;

export const clampC = (n: number) => Math.max(RANGE.min, Math.min(RANGE.max, n));
export const dial = (from: number, startY: number, nowY: number) => clampC(from + Math.round((startY - nowY) / DIAL_STEP));
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export const fahrenheitOf = (celsius: number) => Math.round((celsius * 1.8 + 32) * 10) / 10;
export const adviceOf = (fahrenheit: number) => (fahrenheit < 50 ? 'Bring a coat' : 'No coat');

/** The top of the mercury column for a temperature. */
export const mercuryTop = (celsius: number) =>
	Math.round(TUBE.bottom - ((celsius - RANGE.min) / (RANGE.max - RANGE.min)) * (TUBE.bottom - TUBE.top));

export function describeChain(celsius: number, flipped: boolean): string {
	const fahrenheit = fahrenheitOf(celsius);
	const advice = adviceOf(fahrenheit);
	return flipped
		? `${celsius}°C is ${fahrenheit}°F, which crossed 50, so the sign flips to ${advice}.`
		: `${celsius}°C is ${fahrenheit}°F. The sign still says ${advice}.`;
}

export const REFUSED = '°F and the sign are worked out from the mercury. Move the mercury instead.';

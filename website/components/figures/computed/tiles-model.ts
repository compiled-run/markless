// The Computed figure's values: two inputs, their sum, the dial step, and what the live region says.
export const START = { mugs: 2, coasters: 3 } as const;
export const MAX = 9;
/** Pixels of vertical drag per step of a tile's dial. */
export const DIAL_STEP = 18;

export const clamp = (n: number) => Math.max(0, Math.min(MAX, n));
export const bump = (n: number) => (n >= MAX ? 0 : n + 1);
export const dial = (from: number, startY: number, nowY: number) => clamp(from + Math.round((startY - nowY) / DIAL_STEP));
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export function describeTiles(mugs: number, coasters: number): string {
	return `mugs is ${mugs}, coasters is ${coasters}, so total is ${mugs + coasters}.`;
}

export const REFUSED = 'total is worked out from mugs and coasters. It can’t be set by hand.';

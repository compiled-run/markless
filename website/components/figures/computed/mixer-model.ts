// The Computed figure's values: how much red and blue are on the palette, the colour they mix to, and what the live region says.
export const START = { red: 6, blue: 4 } as const;
export const MAX = 10;
/** Pixels of vertical drag per step of a dab's dial. */
export const DIAL_STEP = 14;

export const clamp = (n: number) => Math.max(0, Math.min(MAX, n));
export const dial = (from: number, startY: number, nowY: number) => clamp(from + Math.round((startY - nowY) / DIAL_STEP));
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

const RED = 'oklch(58% 0.2 27)';
const BLUE = 'oklch(52% 0.16 262)';
export const redOf = (amount: number) => (amount === 0 ? 'transparent' : RED);
export const blueOf = (amount: number) => (amount === 0 ? 'transparent' : BLUE);

/** The swatch: the two dabs mixed by how much of each there is. */
export function mixOf(red: number, blue: number): string {
	if (red + blue === 0) return 'white';
	const share = Math.round((red / (red + blue)) * 100);
	return `color-mix(in oklab, ${RED} ${share}%, ${BLUE})`;
}

export function describeMix(red: number, blue: number): string {
	const lean = red === blue ? 'an even purple' : red > blue ? 'a red-leaning purple' : 'a blue-leaning purple';
	return `red is ${red}, blue is ${blue}, so mix is ${lean}.`;
}

export const REFUSED = 'mix is worked out from red and blue. The brush can’t paint it by hand.';

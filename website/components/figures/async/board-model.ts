// The flap board's values: three cities, how long an answer takes, the newest-answer-wins rule, and what each part is called.
export const CITIES = [
	{ name: 'Austin', temp: '31°' },
	{ name: 'Boston', temp: '12°' },
	{ name: 'Denver', temp: '-3°' },
] as const;
export const WAIT_MS = 1400;
export const SPIN_MS = 110;
/** What the temperature flaps show while they spin. */
export const SPIN = ['8°', '4°', '-2°', '27°', '15°', '0°', '9°'] as const;
export const BLANK = '--';

let newest = 0;
/** A fresh number for each pick; only the newest pick's answer lands. */
export const claim = () => ++newest;
export const isNewest = (pick: number) => pick === newest;

export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export type Stage = 'first' | 'refresh' | 'landed';

/** The caption under the board for the part under the pointer. */
export function nameOf(part: 'city' | 'temp' | 'key', stage: Stage, city: string): string {
	if (part === 'key') return `city = '${city}'`;
	if (part === 'city') return '{city} is plain state, so it changes at once';
	if (stage === 'first') return '@pending: no answer yet';
	if (stage === 'refresh') return 'aria-busy: the old answer stays until the new one lands';
	return '@try: the answer landed';
}

export function describeBoard(stage: 'asked' | 'landed' | 'dropped', city: string): string {
	if (stage === 'asked') return `Asked for ${city}. The city cell changed at once; the temperature is on its way.`;
	if (stage === 'dropped') return `${city}'s answer came back after a newer pick, so it was thrown away.`;
	return `${city}'s temperature landed. Only that cell changed.`;
}

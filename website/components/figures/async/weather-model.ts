// The Async figure's values: three cities and their forecasts, how long an answer takes, and the newest-answer-wins rule.
export type Sky = 'sun' | 'cloud' | 'rain';
export const CITIES = [
	{ name: 'Oslo', temp: 4, sky: 'rain', days: [['Thu', 'cloud', 6], ['Fri', 'rain', 3], ['Sat', 'sun', 7]] },
	{ name: 'Lisbon', temp: 19, sky: 'sun', days: [['Thu', 'sun', 21], ['Fri', 'cloud', 18], ['Sat', 'sun', 22]] },
	{ name: 'Tokyo', temp: 13, sky: 'cloud', days: [['Thu', 'rain', 11], ['Fri', 'cloud', 14], ['Sat', 'sun', 16]] },
] as const;
export const WAIT_MS = 1300;

let newest = 0;
/** A fresh number for each pick; only the newest pick's answer is shown. */
export const claim = () => ++newest;
export const isNewest = (pick: number) => pick === newest;

export const degrees = (n: number) => n + '°';

export function describeWeather(stage: 'asked' | 'landed' | 'dropped', city: string): string {
	if (stage === 'asked') return `Asked for ${city}. The old forecast stays until the new one lands.`;
	if (stage === 'dropped') return `${city}'s answer came back after a newer pick, so it was thrown away.`;
	return `${city}'s forecast landed. Only the card changed.`;
}

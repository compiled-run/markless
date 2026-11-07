// The values the streaming figure shows, and the sentences its live region speaks.
export const TITLE = 'Lemon cake';
export const PATH = '/recipes/lemon';
export const REVIEWS = 'Reviews';
/** The database dial: 0 is fast, 1 is slow. */
export const START_SPEED = 0.45;
/** How long the slow reviews query takes, in milliseconds, for a dial position. */
export const waitOf = (speed: number) => Math.round(700 + Math.min(1, Math.max(0, speed)) * 3300);
/** The dial's pointer angle in degrees for a dial position. */
export const angleOf = (speed: number) => Math.round(-135 + Math.min(1, Math.max(0, speed)) * 270);
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');

export function describeReload(wait: number): string {
	return `Reloaded. The title, photo and steps came at once. Reviews waited ${(wait / 1000).toFixed(1)} seconds, in the same response.`;
}
export const ARRIVED = 'The reviews arrived. The one request in the network panel ended only now.';
export const SAME = 'Still one request. The reviews are coming in the same response, so nothing new is fetched.';
export const describeSpeed = (speed: number) => `Database dial at ${speed < 0.34 ? 'fast' : speed > 0.66 ? 'slow' : 'medium'}. Reload to see it.`;

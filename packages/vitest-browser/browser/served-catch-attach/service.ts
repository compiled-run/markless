import { request } from '../async-recipes/gate.ts';

// The server always fails, so the page is served with its @catch content.
export function loadForecast(city: string, signal: AbortSignal) {
	if (typeof window === 'undefined') return Promise.reject(new Error(`${city} is down.`));
	return request(city, { summary: `${city} sky` }, signal);
}

const realm = globalThis as { __servedCatchCleanups?: number };

export function noteCleanup(): void {
	realm.__servedCatchCleanups = (realm.__servedCatchCleanups ?? 0) + 1;
}

export function cleanups(): number {
	return realm.__servedCatchCleanups ?? 0;
}

export function resetCleanups(): void {
	realm.__servedCatchCleanups = 0;
}

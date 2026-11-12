import { request } from '../async-recipes/gate.ts';

export function loadForecast(city: string, signal: AbortSignal) {
	return request(city, { summary: `${city} sky` }, signal);
}

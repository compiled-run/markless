import { request } from './gate.ts';

export function loadForecast(city: string, signal: AbortSignal) {
	return request(city, { summary: `${city} sky` }, signal);
}

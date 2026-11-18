import { request } from './gate.ts';

const names = ['Austin', 'Boston', 'Bogotá', 'Bordeaux'];

export function findCities(text: string, signal: AbortSignal) {
	const found = names.filter((name) => name.toLowerCase().startsWith(text.toLowerCase()));
	return request(text, found, signal);
}

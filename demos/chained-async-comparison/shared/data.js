export const EXPECTED_TEXT = {
	session: 'Session: Ada',
	recommendations: 'Recommendations: Signals, Compilers',
	catalog: 'Catalog: Markless Handbook',
	reviews: 'Reviews: 42',
};

export function apiUrl(path, run) {
	const origin = globalThis.location?.origin ?? globalThis.__CHAINED_ASYNC_API_ORIGIN;
	if (!origin) throw new Error('chained-async API origin is unavailable');
	const url = new URL(path, origin);
	url.searchParams.set('run', run);
	return url;
}

export async function fetchJson(path, run) {
	const response = await fetch(apiUrl(path, run));
	if (!response.ok) throw new Error(`${path} returned ${response.status}`);
	return response.json();
}

export function runFromLocation() {
	return new URL(globalThis.location.href).searchParams.get('run') ?? 'untracked';
}

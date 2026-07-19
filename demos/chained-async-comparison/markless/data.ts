let apiOrigin = '';
let runToken = '';

export function configureData(origin: string, run: string): void {
	apiOrigin = origin;
	runToken = run;
}

async function request(pathname: string, signal: AbortSignal): Promise<any> {
	const url = new URL(pathname, apiOrigin);
	url.searchParams.set('run', runToken);
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
	return response.json();
}

export function fetchSession(signal: AbortSignal): Promise<any> {
	return request('/api/session', signal);
}

export function fetchRecommendations(user: string, signal: AbortSignal): Promise<any> {
	return request(`/api/recommendations?u=${encodeURIComponent(user)}`, signal);
}

export function fetchCatalog(signal: AbortSignal): Promise<any> {
	return request('/api/catalog', signal);
}

export function fetchReviews(signal: AbortSignal): Promise<any> {
	return request('/api/reviews', signal);
}

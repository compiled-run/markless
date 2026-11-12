import type { MiddlewareHttpContext } from '@markless/router';

const store = globalThis as typeof globalThis & { __formRequests?: string[] };

// Logs every request; a page render uses up a flash message, as a page that shows it would; /legacy-save redirects
// before any api/ route, so its answer is not shaped by the api/ wrapper.
export default function requests(http: MiddlewareHttpContext) {
	const { pathname, search } = http.url;
	if (
		!pathname.startsWith('/build/') &&
		!pathname.startsWith('/_markless/') &&
		pathname !== '/api/requests'
	)
		(store.__formRequests ??= []).push(`${http.request.method} ${pathname}${search}`);
	const page =
		http.request.method === 'GET' && !pathname.startsWith('/api/') && !pathname.includes('.');
	if (page && /(?:^|;\s*)flash=[^;]/.test(http.request.headers.get('cookie') ?? ''))
		http.response.headers.append('set-cookie', 'flash=; Path=/; Max-Age=0');
	if (pathname === '/legacy-save' && http.request.method === 'POST')
		return new Response(null, { status: 303, headers: { location: '/' } });
}

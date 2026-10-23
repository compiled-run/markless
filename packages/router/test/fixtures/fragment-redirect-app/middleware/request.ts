import type { MiddlewareHttpContext } from '@markless/router';

// The page at /moved answers a redirect, as an auth guard or a renamed route does.
export default function request(http: MiddlewareHttpContext) {
	if (http.url.pathname === '/moved')
		return new Response(null, {
			status: 302,
			headers: { location: new URL('/target?from=moved', http.url).href },
		});
	if (http.url.pathname === '/gone')
		return Response.redirect(new URL('/target', http.url).href, 307);
}

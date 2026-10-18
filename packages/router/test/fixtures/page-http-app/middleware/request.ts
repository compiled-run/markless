export default function request(http: import('@markless/router').MiddlewareHttpContext) {
	(http.locals as { requestId?: string }).requestId = 'mw-1';
	http.response.headers.set('x-request-id', 'mw-1');
	http.response.headers.append('set-cookie', 'visit=mw-1; Path=/; HttpOnly');
	http.response.headers.set('x-middleware-path', http.url.pathname);
}

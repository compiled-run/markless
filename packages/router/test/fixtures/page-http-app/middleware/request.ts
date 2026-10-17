export default function request(http: import('@markless/router').MiddlewareHttpContext) {
	(http.locals as { requestId?: string }).requestId = 'mw-1';
}

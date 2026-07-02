export default function request(http: import('@markless/router').MiddlewareHttpContext) {
	http.locals.requestId = 'router-full-stack';
}

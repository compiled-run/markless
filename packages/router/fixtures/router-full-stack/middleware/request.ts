export default function request(http: import('@markless/router').MiddlewareHttpContext) {
	http.locals.requestId = 'router-full-stack';
	http.response.headers.append('set-cookie', 'router-full-stack=1; Path=/');
}

export default function request(http: import('@markless/router').MiddlewareHttpContext) {
	http.response.headers.set('x-markless-router', '1');
}

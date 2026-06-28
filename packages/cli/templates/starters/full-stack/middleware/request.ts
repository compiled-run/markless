export default function request(http: import('@arcade/router').MiddlewareHttpContext) {
	http.response.headers.set('x-arcade-router', '1');
}

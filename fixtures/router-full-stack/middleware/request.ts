export default function request(http: import('@arcade/router').MiddlewareHttpContext) {
	http.locals.requestId = 'router-full-stack';
}

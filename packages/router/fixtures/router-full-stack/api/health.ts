export default function health(http: import('@arcade/router').EndpointHttpContext) {
	http.response.headers.set('x-arcade-router', '1');
	return {
		ok: true,
		pathname: http.url.pathname,
		requestId: http.locals.requestId,
	};
}

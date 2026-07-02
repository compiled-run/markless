export default function health(http: import('@markless/router').EndpointHttpContext) {
	http.response.headers.set('x-markless-router', '1');
	return {
		ok: true,
		pathname: http.url.pathname,
		requestId: http.locals.requestId,
	};
}

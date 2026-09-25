const hits = globalThis as { __logouts?: number };

export default function logout(http: import('@markless/router').EndpointHttpContext) {
	http.response.headers.append('set-cookie', 'session=; Path=/; Max-Age=0');
	hits.__logouts = (hits.__logouts ?? 0) + 1;
	return { loggedOut: hits.__logouts };
}

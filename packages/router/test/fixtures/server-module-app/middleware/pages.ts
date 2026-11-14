import type { MiddlewareHttpContext } from '@markless/router';
import { notePageRequest } from '../server/counter.ts';

export default function pages(http: MiddlewareHttpContext) {
	if (http.request.method === 'GET' && http.url.pathname === '/') notePageRequest();
}

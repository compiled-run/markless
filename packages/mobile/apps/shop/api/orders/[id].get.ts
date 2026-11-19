import type { EndpointHttpContext } from '@markless/router';
import { order } from '../../server/catalog.ts';

export default function one({ params }: EndpointHttpContext<{ id: string }>) {
	const found = order(params.id);
	return found ? Response.json(found) : new Response('No such order.', { status: 404 });
}

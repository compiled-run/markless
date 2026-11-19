import type { EndpointHttpContext } from '@markless/router';
import type { CartLine } from '../lib/types.ts';
import { placeOrder } from '../server/catalog.ts';

export default async function create({ request }: EndpointHttpContext) {
	const lines = (await request.json()) as CartLine[];
	if (!Array.isArray(lines) || lines.length === 0)
		return new Response('The cart is empty.', { status: 422 });
	return Response.json(placeOrder(lines), { status: 201 });
}

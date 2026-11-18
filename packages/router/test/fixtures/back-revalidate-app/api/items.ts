import { itemsFromSource } from '../src/items.ts';

export default async function items(): Promise<Response> {
	try {
		return Response.json(await itemsFromSource(), { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 503, headers: { 'cache-control': 'no-store' } });
	}
}

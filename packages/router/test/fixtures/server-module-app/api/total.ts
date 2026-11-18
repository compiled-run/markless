import { readCount } from '../server/counter.ts';

export function total(): string {
	return `total ${readCount()}`;
}

export default function totalRoute() {
	return Response.json({ total: total() });
}

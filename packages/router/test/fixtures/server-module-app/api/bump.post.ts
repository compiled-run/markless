import { bumpCount } from '../server/counter.ts';

export default function bump() {
	return Response.json({ count: bumpCount() });
}

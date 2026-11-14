import { readCount, readPageRequests } from '../server/counter.ts';

export default function count() {
	return Response.json({ count: readCount(), pageRequests: readPageRequests() });
}

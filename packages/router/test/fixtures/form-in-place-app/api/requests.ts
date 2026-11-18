const store = globalThis as typeof globalThis & { __formRequests?: string[] };

// What the server was asked since the last call, oldest first.
export default function requests(): Response {
	const seen = store.__formRequests ?? [];
	store.__formRequests = [];
	return Response.json(seen, { headers: { 'cache-control': 'no-store' } });
}

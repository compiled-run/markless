// Stand-in for a fetch: each answer adds one row and keeps the earlier rows as they were; a call made while a failure is armed rejects once.
let failNext = false;
export function failNextFetch() {
	failNext = true;
}
export async function fetchPosts(
	round: number,
	failing = false,
): Promise<{ id: number; title: string; flagged: boolean }[]> {
	await new Promise((resolve) => setTimeout(resolve, 20));
	if (failing || failNext) {
		failNext = false;
		throw new Error(`offline at ${round}`);
	}
	return Array.from({ length: 3 + round }, (_, index) => ({
		id: index + 1,
		title: `post ${index + 1}`,
		flagged: index !== 1,
	}));
}

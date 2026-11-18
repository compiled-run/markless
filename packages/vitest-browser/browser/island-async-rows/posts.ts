export function loadPosts(page: number, signal: AbortSignal) {
	const posts = [1, 2].map((n) => ({ id: `${page}-${n}`, title: `Post ${n} of page ${page}` }));
	return new Promise<typeof posts>((resolve, reject) => {
		const timer = setTimeout(() => resolve(posts), 30);
		signal.addEventListener('abort', () => {
			clearTimeout(timer);
			reject(signal.reason);
		});
	});
}

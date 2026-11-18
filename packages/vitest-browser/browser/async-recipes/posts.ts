import { request } from './gate.ts';

export function loadPosts(page: number, signal: AbortSignal) {
	const posts = [1, 2].map((n) => ({ id: `${page}.${n}`, title: `Post ${page}.${n}` }));
	return request(`page ${page}`, posts, signal);
}

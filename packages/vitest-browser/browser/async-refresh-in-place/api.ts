// Stand-ins for the explanation page's fetches; a test can make the next posts request fail once.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let failNextPosts = false;

export function failPostsOnce(): void {
	failNextPosts = true;
}

export async function getUser(id: string): Promise<{ readonly name: string } | null> {
	await wait(60);
	return { name: `user ${id}` };
}

export async function getPosts(id: string, sort: string): Promise<{ id: number; title: string }[]> {
	await wait(90);
	if (failNextPosts) {
		failNextPosts = false;
		throw new Error('posts unavailable');
	}
	const posts = [
		{ id: 1, title: `${id} first` },
		{ id: 2, title: `${id} second` },
	];
	return sort === 'top' ? posts.reverse() : posts;
}

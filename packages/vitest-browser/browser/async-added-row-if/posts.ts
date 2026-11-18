// Stand-in for a fetch: the answer is a pure function of what the page asked for, so the server and the browser agree at load.
export type Post = { id: number; likes: number };

export async function postsAt(added: number, liked: readonly number[]): Promise<Post[]> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return Array.from({ length: 3 + added }, (_, index) => ({
		id: index + 1,
		likes: liked.filter((id) => id === index + 1).length,
	}));
}

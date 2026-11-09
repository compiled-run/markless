// Stand-ins for a fetch: each answers after a short wait with values named after what it was asked.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Account = { readonly name: string; readonly vip: boolean };

export async function fetchAccount(round: number, vipFrom: number): Promise<Account> {
	await wait(80);
	return { name: `account ${round}`, vip: round >= vipFrom };
}

export async function fetchNotes(round: number): Promise<{ id: number; body: string }[]> {
	await wait(70);
	const rows = [
		{ id: 1, body: `note a${round}` },
		{ id: 2, body: `note b${round}` },
	];
	return round > 0 ? [...rows, { id: 3, body: `note c${round}` }] : rows;
}

export type User = { readonly name: string };

export async function getUser(id: string, round: number): Promise<User> {
	await wait(60);
	return { name: `user ${id} r${round}` };
}

export type Post = { readonly id: number; readonly title: string };

export async function getPosts(id: string, sort: string): Promise<Post[]> {
	await wait(90);
	const posts = [
		{ id: 1, title: `${id} first` },
		{ id: 2, title: `${id} second` },
	];
	return sort === 'top' ? posts.reverse() : posts;
}

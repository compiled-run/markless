// Stand-ins for a fetch: each answers after a short wait with values named after what it was asked.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Account = { readonly name: string; readonly vip: boolean };

export async function fetchAccount(round: number, vipFrom: number): Promise<Account> {
	await wait(60);
	return { name: `account ${round}`, vip: round >= vipFrom };
}

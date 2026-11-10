// Stand-ins for a fetch: each answers after a short wait with values named after what it was asked.
export async function balanceOf(name: string, round: number): Promise<string> {
	await new Promise((resolve) => setTimeout(resolve, 150));
	if (name === 'Broken') throw new Error('ledger offline');
	return `${name}#${round}`;
}

export async function listAccounts(): Promise<{ id: string; name: string }[]> {
	await new Promise((resolve) => setTimeout(resolve, 100));
	return [
		{ id: 'p1', name: 'Pay' },
		{ id: 'p2', name: 'Save' },
	];
}

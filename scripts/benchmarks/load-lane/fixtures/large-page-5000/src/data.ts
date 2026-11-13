export type Row = { readonly id: number; readonly label: string; readonly done: boolean };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function loadRows(count: number): Promise<ReadonlyArray<Row>> {
	await wait(60);
	return Array.from({ length: count }, (_, index) => ({ id: index + 1, label: `Row number ${index + 1}`, done: index % 3 === 0 }));
}

export async function loadStat(name: string): Promise<{ readonly name: string; readonly value: number }> {
	await wait(40);
	return { name, value: name.length * 7 };
}

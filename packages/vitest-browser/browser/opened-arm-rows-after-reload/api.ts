export const answered: number[] = [];

export async function rowsUpTo(count: number): Promise<Array<{ id: string; text: string }>> {
	answered.push(count);
	return Array.from({ length: count }, (_, i) => ({ id: `r${i}`, text: `row ${i}` }));
}

export async function sizeOf(count: number): Promise<string> {
	return `size ${count}`;
}

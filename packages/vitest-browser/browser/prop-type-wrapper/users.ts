export const requested: number[] = [];

export async function getUser(id: number): Promise<{ name: string }> {
	requested.push(id);
	await new Promise((resolve) => setTimeout(resolve, 10));
	return { name: `user ${id}` };
}

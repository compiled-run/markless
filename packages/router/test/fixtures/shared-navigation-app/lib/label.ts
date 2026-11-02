export async function labelFor(value: string): Promise<{ text: string }> {
	await new Promise((resolve) => setTimeout(resolve, 40));
	return { text: `label ${value}` };
}

export async function slow(tag: string, ms = 500): Promise<{ text: string }> {
	await new Promise((resolve) => setTimeout(resolve, ms));
	return { text: `loaded ${tag}` };
}

// Answers after a delay longer than any click takes to reach the server, and says where it ran.
export async function slow(tag: string): Promise<{ text: string; side: string }> {
	const side = typeof window === 'undefined' ? 'server' : 'browser';
	console.log(`slow() ${side} ${tag}`);
	await new Promise((resolve) => setTimeout(resolve, 600));
	return { text: `loaded ${tag}`, side };
}

// Answers well inside the navigation deadline.
export async function quick(tag: string): Promise<{ text: string }> {
	await new Promise((resolve) => setTimeout(resolve, 60));
	return { text: `quick ${tag}` };
}

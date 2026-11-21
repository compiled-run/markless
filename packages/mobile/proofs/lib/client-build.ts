export function buildOf(): string {
	const side = import.meta.env.SSR ? 'server' : 'client';
	return `${side}, ${import.meta.env.MODE}, dev ${import.meta.env.DEV}, prod ${import.meta.env.PROD}`;
}

export async function loadGreeting(): Promise<string> {
	if (import.meta.env.SSR) {
		const { greeting } = await import('./server-greeting.ts');
		return greeting();
	}
	return import.meta.env.DEV ? 'hello from the dev client' : 'hello from the client';
}

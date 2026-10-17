const seen = ((globalThis as { __idleAnalytics?: string[] }).__idleAnalytics ??= []);

export function record(name: string): void {
	seen.push(name);
}

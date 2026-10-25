export function record(label: string, value: unknown): string {
	return `${label}:${String(value)}`;
}

export function hrefFor(pattern: string, params: Readonly<Record<string, string>>): string {
	return pattern.replace(/\[(\w+)\]/g, (_match, name: string) => encodeURIComponent(params[name] ?? ''));
}

declare module '@tsrx/core' {
	export function parseModule(source: string, filename?: string): unknown;
	export function isEventAttribute(name: string): boolean;
	export function normalizeEventName(name: string): string;
}

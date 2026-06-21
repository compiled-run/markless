declare module 'vitest/browser' {
	export interface BrowserPage {
		extend(extension: Record<PropertyKey, unknown>): void;
	}

	export const page: BrowserPage;
}

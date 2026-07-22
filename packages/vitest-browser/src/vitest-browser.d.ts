import type { SsrFixtureRenderOptions } from './ssr-plugin.ts';

declare module 'vitest/browser' {
	export interface BrowserCommands {
		renderSSR(
			componentModulePath: string,
			exportName: string,
			options?: SsrFixtureRenderOptions,
		): Promise<{ readonly html: string }>;
		renderStreamShell(
			componentModulePath: string,
			exportName: string,
			options?: SsrFixtureRenderOptions,
		): Promise<{ readonly shell: string }>;
	}

	export interface BrowserPage {
		extend(extension: Record<PropertyKey, unknown>): void;
	}

	export const page: BrowserPage;
}

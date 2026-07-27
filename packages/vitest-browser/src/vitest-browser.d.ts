// LOCAL TYPECHECK SHIM — deliberately NOT shipped.
//
// This repo's browser project gets its provider from `vite-plus/test/browser-playwright`,
// so `@vitest/browser-playwright` is not installed and vitest/browser's own
// `export * from '@vitest/browser-playwright/context'` resolves to nothing. That
// leaves `page` untyped for src/vitest.ts inside this workspace only; a consumer
// installing a real vitest browser provider gets these types from that provider.
//
// Consumer-facing types live in a pack ENTRY instead: the `BrowserCommands`
// augmentation for the renderSSR/renderStreamShell commands is declared inline in
// src/ssr-plugin.ts, which is emitted to dist/ssr-plugin.d.ts. An ambient .d.ts
// like this one is not an entry, so the build drops it — which is exactly why the
// augmentation never reached consumers before.
declare module 'vitest/browser' {
	export interface BrowserPage {
		extend(extension: Record<PropertyKey, unknown>): void;
	}

	export const page: BrowserPage;
}

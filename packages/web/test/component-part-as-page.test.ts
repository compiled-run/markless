import { expect, test } from 'vitest';
import { marklessSsrComponentPart } from '../src/fns/ssr.ts';
import { renderToStream } from '../src/render-to-stream.ts';
import {
	MARKLESS_COMPONENT_PART_BRAND,
	renderToString,
	type SsrRenderArtifact,
} from '../src/render-to-string.ts';

// The shapes the bundler publishes for a module serving two components: the root
// merged with the module surface, every other export a bare part.
const servedPart = { renderSsr: () => ({ html: '<button data-row="north">North</button>' }) };
const surface = {
	resumeModuleUrl: '/build/resume-A1b2.js',
	renderSsr: () => ({ html: '<main>page</main>' }),
	renderSsrComponents: { App: { renderSsr: () => ({ html: '<main>page</main>' }) }, Served: servedPart },
};
const rootExport = { ...surface, renderSsr: surface.renderSsrComponents.App.renderSsr };
const barePartExport = {
	...servedPart,
	[MARKLESS_COMPONENT_PART_BRAND]: 'Served',
} as SsrRenderArtifact;

test('a page rendered from a bare part export is refused, naming the export and the way out', async () => {
	await expect(renderToString(barePartExport)).rejects.toThrow(
		/^MARKLESS_COMPONENT_PART_AS_PAGE: "Served" is published as a bare render part, not a page\./,
	);
	await expect(renderToString(barePartExport)).rejects.toThrow(/root export/);
});

test('the streaming page path refuses the same bare part', async () => {
	await expect(renderToStream(barePartExport)).rejects.toThrow(
		/^MARKLESS_COMPONENT_PART_AS_PAGE: "Served"/,
	);
});

test('a page rendered from the root export is unaffected', async () => {
	expect(await renderToString(rootExport)).toContain('<main>page</main>');
});

test('composing a bare part inside a page is untouched by the refusal', async () => {
	// Composition reads the module map, which the bundler leaves unbranded.
	const mapEntry = marklessSsrComponentPart(surface, 'Served');
	expect(mapEntry).toBe(servedPart);
	expect(MARKLESS_COMPONENT_PART_BRAND in (mapEntry as object)).toBe(false);

	// A barrel re-export answers as itself, brand and all, and still renders as a child.
	const imported = marklessSsrComponentPart(barePartExport, 'Served');
	expect(imported?.renderSsr?.({}, undefined)).toEqual({
		html: '<button data-row="north">North</button>',
	});
});

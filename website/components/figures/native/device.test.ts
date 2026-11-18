import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing } from './device.ts';

const sceneArt = drawing();
const page = readFileSync(new URL('../../../pages/how-it-works/native-targets.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./device-anatomy.tsrx', import.meta.url), 'utf8');

describe('the native-targets figure', () => {
	it('draws the same scene every time, with enough ink to read', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(sceneArt));
		const objects = (sceneArt as { objects?: Record<string, { layers: { d: string }[] }> }).objects ?? {};
		const all = [...sceneArt.layers, ...Object.values(objects).flatMap((o) => o.layers)];
		expect(all.length).toBeGreaterThan(8);
		expect(all.map((layer) => layer.d).join('').length).toBeGreaterThan(8000);
		expect(Object.keys(objects).length).toBeLessThanOrEqual(3);
	});

	it('has one margin note, a live region, a tour that stops on touch, and no wires', () => {
		expect(piece).toContain('search(query)');
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('if (!seen || touched) return;');
		expect(piece).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches");
		expect(piece).toContain("event.key === 'Escape'");
		expect(piece).not.toMatch(/(cord|crocodile|wire)s?/i);
	});

	it('answers the pointer: every object lifts on hover', () => {
		expect(piece).toContain('onPointerover');
		expect(piece).toContain("data-hover=");
	});

	it('is on the Native targets page', () => {
		expect(page).toContain("from '../../components/figures/native/device-anatomy.tsrx';");
	});
});

describe('the layers are the proof\'s real views', () => {
	it('names only UIKit classes the iOS proof creates, and finds no web view', async () => {
		const { readFileSync: read } = await import('node:fs');
		const swift = read(new URL('../../../../poc/fixtures/proofs/ios-native-rendering-target/ios/Sources/MarklessNativeProof/MarklessNativeRuntime.swift', import.meta.url), 'utf8') + read(new URL('../../../../poc/fixtures/proofs/ios-native-rendering-target/ios/DemoApp/DemoApp.swift', import.meta.url), 'utf8');
		const { LAYERS, search } = await import('./model.ts');
		for (const layer of LAYERS) expect(swift).toContain(layer.name);
		expect(search('WebView')).toEqual([]);
		expect(swift).not.toMatch(/WKWebView/);
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by device.test.ts from device.ts. Run the figure test with -u to refresh.
import type { drawing } from './device.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(sceneArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./device.art.ts');
	});
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { compileNativeComponent } from '../src/compile.ts';
import { readWorkspaceModule } from '../src/harness/rung.ts';
import { nodeScriptHost } from '../src/node-engine.ts';
import { createNativeRuntime } from '../src/runtime.ts';
import { nativeStyleInput } from '../src/style-input.ts';

const folder = 'packages/mobile/proofs/u98-family-styles';
const build = await compileNativeComponent({
	filename: `${folder}/App.tsrx`,
	source: readFileSync(
		join(import.meta.dirname, '..', 'proofs', 'u98-family-styles', 'App.tsrx'),
		'utf8',
	),
	readModule: readWorkspaceModule,
});

test("a component two imports down brings its <style> blocks, and its element takes the module's scope class before the caller's", () => {
	const badge = build.styles.find((style) => style.cssText.includes('[ui-badge]'));
	const tone = build.styles.find((style) => style.cssText.includes('.tone'));
	expect(badge && tone).toBeTruthy();
	const input = nativeStyleInput(build.payload!, build.styles);
	expect(input.css).toContain(`[ui-badge].${badge!.scopeId}`);
	const element = input.nodes.find(
		(node) => node.kind === 'element' && 'ui-badge' in node.attributes,
	);
	expect(element?.kind === 'element' && element.attributes['class']).toBe(
		`${badge!.scopeId} tone ${tone!.scopeId}`,
	);
});

test('state seeded from a prop the part was not given reads undefined in its script, as on the web', () => {
	const cell = build.payload!.cells.find((entry) => entry.name === 'handle.point');
	expect(cell).toMatchObject({ initial: null, unset: true });
	const runtime = createNativeRuntime(
		build.payload!,
		new Map(),
		{},
		undefined,
		undefined,
		build.payload!.script ? nodeScriptHost() : undefined,
	);
	expect(runtime.texts().map(([, text]) => text)).toContain('Seed none');
});

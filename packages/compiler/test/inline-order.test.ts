import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

// Declaration order inside a `.tsrx` module must not change what a handler
// compiles to. A shared() method called from a handler in the SAME module is
// inlined by copying the method's authored body into the handler; if that inline
// were sensitive to where an ordinary module-level function stands, the
// (correct) unresolved-reference guard would refuse the build on the free
// instance name and ordinary authored code would stop compiling for a reason the
// author cannot see.
//
// These are order-invariance pins, not capability tests: each one compiles the
// same module twice, differing only in where a plain module-level function
// stands, and requires the emitted handler text to be byte-identical.

function errors(compiled: Parameters<typeof collectTsrxModuleDiagnostics>[0]) {
	return collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error');
}

const FAMILY_ROOT = fileURLToPath(new URL('../../headless/components/src/', import.meta.url));

/** An ordinary module-level function: no markup, no shared() resolution. */
const HELPER = `
export function pushToast(text) {
	return '[' + text + ']';
}
`;

const SHARED_FAMILY = `
import { shared, state } from '@markless/core';

export const counterState = shared(() => {
	const s = state({ count: 0 });
	return {
		...s,
		bump(by) {
			s.count = s.count + by;
		},
	};
}, { scope: 'widget' });
`;

const INSIDE = `
export default function Inside() @{
	const box = counterState();
	<div><button onClick={() => box.bump(1)}>go</button>{box.count}</div>
}
`;

/**
 * What one module compiles to, reduced to the parts declaration order could
 * perturb: the error codes and every handler-shaped symbol's emitted source.
 */
async function fingerprint(filename: string, source: string): Promise<string> {
	const compiled = await compileTsrxModule({ filename, source, symbols: [] });
	const handlers = compiled.symbolModules.modules
		.filter((item) => item.kind === 'event-handler' || item.kind === 'callback-prop')
		.map((item) => item.source)
		.join('\n---\n');
	return `codes=[${errors(compiled)
		.map((item) => item.code)
		.sort()
		.join(',')}]\n${handlers}`;
}

test('a module-level function above the component inlines the same as one below it', async () => {
	const above = await fingerprint('src/m.tsrx', SHARED_FAMILY + HELPER + INSIDE);
	const below = await fingerprint('src/m.tsrx', SHARED_FAMILY + INSIDE + HELPER);

	// The inline really happened in both — an un-inlined handler would still
	// spell `box.bump(1)` and the two orderings would agree on being broken.
	expect(above).toContain('context.graph.write(');
	expect(above).toContain('shared:src/m.tsrx#counterState/state:s');
	expect(above).not.toContain('box.bump');
	// The byte-identical checkpoint: order changed nothing.
	expect(above).toBe(below);
});

test('the same holds when the handler also calls that module-level function', async () => {
	const inside = `
export default function Inside() @{
	const box = counterState();
	<div><button onClick={() => { pushToast('x'); box.bump(1); }}>go</button>{box.count}</div>
}
`;

	const above = await fingerprint('src/m.tsrx', SHARED_FAMILY + HELPER + inside);
	const below = await fingerprint('src/m.tsrx', SHARED_FAMILY + inside + HELPER);

	expect(above).toContain('context.graph.write(');
	expect(above).not.toContain('box.bump');
	expect(above).toBe(below);
});

/** Every shipped `@markless/ui` family module, by directory. */
function familyModules(): ReadonlyArray<{ readonly name: string; readonly source: string }> {
	const modules: Array<{ name: string; source: string }> = [];
	for (const directory of readdirSync(FAMILY_ROOT, { withFileTypes: true })) {
		if (!directory.isDirectory()) continue;
		for (const entry of readdirSync(join(FAMILY_ROOT, directory.name), { withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith('.tsrx')) continue;
			modules.push({
				name: `${directory.name}/${entry.name}`,
				source: readFileSync(join(FAMILY_ROOT, directory.name, entry.name), 'utf8'),
			});
		}
	}
	return modules;
}

// The shipped families are the real corpus: widget-scoped shared() definitions,
// several components per module, methods called from the family's own parts.
// One compile per shipped family: the budget scales with the catalog.
test('no shipped family module changes what it emits when a function moves above its first component', async () => {
	const modules = familyModules();
	expect(modules.length).toBeGreaterThan(10);

	const differing: string[] = [];
	for (const item of modules) {
		const firstComponent = /^export (?:default )?function [A-Z]/m.exec(item.source);
		if (!firstComponent?.index) continue;

		const filename = `src/${item.name}`;
		const above = await fingerprint(
			filename,
			item.source.slice(0, firstComponent.index) + HELPER + item.source.slice(firstComponent.index),
		);
		const below = await fingerprint(filename, item.source + HELPER);
		if (above !== below) differing.push(item.name);
	}

	expect(differing).toEqual([]);
}, 60_000);

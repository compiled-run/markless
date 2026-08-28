import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A capture slot id is spelled from names, never from source offsets: an
// offset-spelled id moves whenever text is inserted earlier in the module, which
// makes emitted handler bytes depend on where an unrelated declaration stands.

/** An ordinary module-level function, added only to shift every later offset. */
const HELPER = `
export function pushToast(text) {
	return '[' + text + ']';
}
`;

/** The smallest shape that emitted an offset-spelled slot: a component forwarding
 * an optional callback prop, with a same-module call site, declared second. */
const FORWARDER = `
import { state } from '@markless/core';

export default function Page() @{
	const box = state({ n: 0 });
	<div><Row onPress={() => { box.n = box.n + 1; }} />{box.n}</div>
}

function Row({ onPress }) @{
	<button onClick={(event) => { onPress?.(event); }}>go</button>
}
`;

async function compile(source: string, filename = 'src/forwarder.tsrx') {
	return compileTsrxModule({ filename, source, symbols: [] });
}

async function handlerSources(source: string, filename?: string): Promise<string> {
	const compiled = await compile(source, filename);
	return compiled.symbolModules.modules
		.filter((item) => item.kind === 'event-handler' || item.kind === 'callback-prop')
		.map((item) => item.source)
		.join('\n---\n');
}

function slotIds(compiled: Awaited<ReturnType<typeof compile>>) {
	return compiled.captureAnalysis.extractedSymbols.map((symbol) =>
		symbol.captureSlots.map((slot) => slot.id),
	);
}

test('a forwarded callback prop gets a name-spelled slot id, not one built from source offsets', async () => {
	const compiled = await compile(FORWARDER);
	const ids = slotIds(compiled).flat();

	expect(ids).toContain('capture-slot:prop:Row:onPress#0');
	// The retired spelling was `capture-slot:binding:<start>:<end>:<start>:<end>`.
	for (const id of ids) expect(id).not.toMatch(/:\d+:\d+/);
});

test('hoisting an unrelated function above the components changes no emitted handler byte', async () => {
	const below = await handlerSources(FORWARDER + HELPER);
	const above = await handlerSources(HELPER + FORWARDER);

	// The slot really is reached, so the comparison is not two empty handlers.
	expect(below).toContain('capture-slot:prop:Row:onPress#0');
	expect(above).toBe(below);
});

const FAMILY_ROOT = fileURLToPath(new URL('../../headless/components/src/', import.meta.url));

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

// Ids key the slot map a symbol resolves against at resume, so two slots of one
// symbol sharing an id would lose one of them; the trailing arrival ordinal is
// what keeps reads that agree on component, prop, and path apart.
// One compile per shipped family: the budget scales with the catalog.
test('across the shipped families, no symbol carries two capture slots under one id', async () => {
	const modules = [{ name: 'forwarder.tsrx', source: FORWARDER }, ...familyModules()];
	expect(modules.length).toBeGreaterThan(10);

	const collisions: string[] = [];
	const offsetSpelled: string[] = [];
	for (const item of modules) {
		for (const ids of slotIds(await compile(item.source, `src/${item.name}`))) {
			if (new Set(ids).size !== ids.length) collisions.push(`${item.name}: ${ids.join(', ')}`);
			for (const id of ids) if (/:\d+:\d+/.test(id)) offsetSpelled.push(`${item.name}: ${id}`);
		}
	}

	expect(collisions).toEqual([]);
	expect(offsetSpelled).toEqual([]);
}, 60_000);

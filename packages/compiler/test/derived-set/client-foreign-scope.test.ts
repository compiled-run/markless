import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../../src/index.ts';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

// The server module carries a foreign factory computed's scope; the module the
// browser fetches to re-derive the same cell has to carry it too. Without the
// carry the copied expression still spells `shout` and `SUFFIX` with nothing
// bound, the served HTML is right, and the page throws on the first refresh.

const HELPERS = `
export function shout(text) { return String(text).toUpperCase(); }
export function whisper(text) { return String(text).toLowerCase(); }
`;

const FAMILY = `
import { shared, state, computed } from '@markless/core';
import { shout, whisper } from './helpers.ts';
import trim from 'text-tools';

const SUFFIX = '!';
const PREFIX = '[' + SUFFIX;
const UNRELATED = 'nobody reads me';

export const box = shared(() => {
	const s = state({ label: 'a' });
	const loud = computed(() => shout(s.label));
	const quiet = computed(() => whisper(s.label));
	const wrapped = computed(() => PREFIX + s.label);
	const trimmed = computed(() => trim(s.label));
	const plain = computed(() => s.label + '?');
	const echoed = computed(() => loud + '?');
	return { ...s, loud, quiet, wrapped, trimmed, plain, echoed };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.loud}</div>
}
`;

type Compiled = Awaited<ReturnType<typeof compileTsrxModulesWithInterfaces>>[number];

async function compilePage(page: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/family/helpers.ts', source: HELPERS, importSource: './helpers.ts' },
		{ filename: 'src/family/box.tsrx', source: FAMILY, importSource: '../family/box.tsrx' },
		{ filename: 'src/pages/page.tsrx', source: page },
	]);
	return { family: results[1]!, page: results.at(-1)! };
}

function errors(compiled: Compiled) {
	return collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error');
}

/**
 * The one derive module built from a given authored expression.
 *
 * A module is found by the authored text it records rather than by index: a
 * reading file emits a derive module per cell of the factory, so index would
 * pin nothing about which copy carried what.
 */
function deriveModule(compiled: Compiled, authored: string): string {
	const found = compiled.symbolModules.modules.filter(
		(module) =>
			module.kind === 'sync-computed-derive' &&
			module.source.includes(`authoredSource = ${JSON.stringify(authored)}`),
	);
	expect(found.map((module) => module.symbolId)).toHaveLength(1);
	return found[0]!.source;
}

function pageReading(expression: string, extra = '') {
	return `
import { box } from '../family/box.tsrx';
${extra}
export default function Page() @{
	const b = box();
	<div>{${expression}}</div>
}
`;
}

test('a relative specifier is rebased onto the reading file, which is what the symbol module resolves against', async () => {
	const compiled = await compilePage(pageReading('b.loud'));

	expect(errors(compiled.page)).toEqual([]);
	// './helpers.ts' next to src/family/box.tsrx is '../family/helpers.ts' from src/pages/.
	expect(deriveModule(compiled.page, '() => shout(s.label)')).toContain(
		'import { shout } from "../family/helpers.ts";',
	);
});

test('a package specifier carries unchanged', async () => {
	const compiled = await compilePage(pageReading('b.trimmed'));

	expect(errors(compiled.page)).toEqual([]);
	expect(deriveModule(compiled.page, '() => trim(s.label)')).toContain(
		'import trim from "text-tools";',
	);
});

test('a module constant written out of another one carries both, in declaration order', async () => {
	const emitted = deriveModule(
		(await compilePage(pageReading('b.wrapped'))).page,
		'() => PREFIX + s.label',
	);

	expect(emitted).toContain("const SUFFIX = '!';");
	expect(emitted).toContain("const PREFIX = '[' + SUFFIX;");
	expect(emitted.indexOf('const SUFFIX')).toBeLessThan(emitted.indexOf('const PREFIX'));
});

test('only what the copied expression names comes across', async () => {
	const emitted = deriveModule(
		(await compilePage(pageReading('b.loud'))).page,
		'() => shout(s.label)',
	);

	expect(emitted).not.toContain('whisper');
	expect(emitted).not.toContain('text-tools');
	expect(emitted).not.toContain('SUFFIX');
	expect(emitted).not.toContain('UNRELATED');
});

test('a self-contained cell carries nothing', async () => {
	const compiled = await compilePage(pageReading('b.plain'));

	expect(errors(compiled.page)).toEqual([]);
	expect(deriveModule(compiled.page, "() => s.label + '?'")).not.toContain('helpers.ts');
});

test('the defining file keeps its own specifier, uncarried', async () => {
	const compiled = await compilePage(pageReading('b.loud'));

	expect(errors(compiled.family)).toEqual([]);
	// Its own module already imports it; a carry here would bind the name twice.
	expect(deriveModule(compiled.family, '() => shout(s.label)')).toContain(
		'import { shout } from "./helpers.ts";',
	);
});

// A cell of the factory that reads a SIBLING cell is not a second copy of the
// sibling: the lowering turns `loud()` into a graph read, so that module needs
// none of the family's scope, while the sibling's own derive module ships
// beside it and carries the scope in its own right.
test('a cell reading a sibling carries nothing, and the sibling carries its own scope', async () => {
	const compiled = await compilePage(pageReading('b.echoed'));

	expect(errors(compiled.page)).toEqual([]);
	const echoed = deriveModule(compiled.page, "() => loud + '?'");
	expect(echoed).toContain('#box/computed:loud');
	expect(echoed).not.toContain('import { shout }');

	expect(deriveModule(compiled.page, '() => shout(s.label)')).toContain(
		'import { shout } from "../family/helpers.ts";',
	);
});

test('two cells needing different imports of one file each get their own', async () => {
	const compiled = await compilePage(pageReading('b.loud + b.quiet'));

	expect(errors(compiled.page)).toEqual([]);
	expect(deriveModule(compiled.page, '() => shout(s.label)')).toContain(
		'import { shout } from "../family/helpers.ts";',
	);
	expect(deriveModule(compiled.page, '() => whisper(s.label)')).toContain(
		'import { whisper } from "../family/helpers.ts";',
	);
});

test('an import the reading file already has from the same file is not carried twice', async () => {
	const compiled = await compilePage(
		pageReading('b.loud + shout("here")', `import { shout } from '../family/helpers.ts';`),
	);
	const emitted = deriveModule(compiled.page, '() => shout(s.label)');

	expect(errors(compiled.page)).toEqual([]);
	expect(emitted.split('\n').filter((line) => line.includes('{ shout }'))).toHaveLength(1);
});

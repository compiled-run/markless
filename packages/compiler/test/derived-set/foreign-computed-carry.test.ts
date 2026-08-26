import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../../src/index.ts';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

// The carry itself: which specifier the emitted import spells once the copy has
// moved to a file in another directory, which parts of the defining file's scope
// come with it, and which stay behind.

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
	return { ...s, loud, quiet, wrapped, trimmed, plain };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.loud}</div>
}
`;

async function compilePage(page: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/family/helpers.ts', source: HELPERS, importSource: './helpers.ts' },
		{ filename: 'src/family/box.tsrx', source: FAMILY, importSource: '../family/box.tsrx' },
		{ filename: 'src/pages/page.tsrx', source: page },
	]);
	return results.at(-1)!;
}

function errors(compiled: Parameters<typeof collectTsrxModuleDiagnostics>[0]) {
	return collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error');
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

test('a relative specifier is rewritten to reach the same file from the reading module', async () => {
	const page = await compilePage(pageReading('b.loud'));

	expect(errors(page)).toEqual([]);
	// './helpers.ts' next to src/family/box.tsrx is '../family/helpers.ts' from src/pages/.
	expect(page.publicRenderModule.ssrModuleSource).toContain(
		'import { shout } from "../family/helpers.ts";',
	);
});

test('a package specifier carries unchanged', async () => {
	const page = await compilePage(pageReading('b.trimmed'));

	expect(errors(page)).toEqual([]);
	expect(page.publicRenderModule.ssrModuleSource).toContain('import trim from "text-tools";');
});

test('a module constant written out of another one carries both, in declaration order', async () => {
	const ssr = (await compilePage(pageReading('b.wrapped'))).publicRenderModule.ssrModuleSource;

	expect(ssr).toContain("const SUFFIX = '!';");
	expect(ssr).toContain("const PREFIX = '[' + SUFFIX;");
	expect(ssr.indexOf('const SUFFIX')).toBeLessThan(ssr.indexOf('const PREFIX'));
});

test('only what the copied expression names comes across', async () => {
	const ssr = (await compilePage(pageReading('b.loud'))).publicRenderModule.ssrModuleSource;

	// `whisper` is imported on the same statement as `shout` and never named by
	// this copy; the constants and the package import belong to other cells.
	expect(ssr).not.toContain('whisper');
	expect(ssr).not.toContain('text-tools');
	expect(ssr).not.toContain('SUFFIX');
	expect(ssr).not.toContain('UNRELATED');
});

test('two cells needing the same import carry it once', async () => {
	const ssr = (await compilePage(pageReading('b.loud + b.quiet'))).publicRenderModule
		.ssrModuleSource;
	const imports = ssr.split('\n').filter((line) => line.includes('../family/helpers.ts'));

	expect(imports).toHaveLength(2);
	expect(imports).toContain('import { shout } from "../family/helpers.ts";');
	expect(imports).toContain('import { whisper } from "../family/helpers.ts";');
});

test('an import the reading module already has from the same file is not carried twice', async () => {
	const page = await compilePage(
		pageReading('b.loud + shout("here")', `import { shout } from '../family/helpers.ts';`),
	);
	const ssr = page.publicRenderModule.ssrModuleSource;

	expect(errors(page)).toEqual([]);
	expect(ssr.split('\n').filter((line) => line.includes('{ shout }'))).toHaveLength(1);
});

test('the same name from a different file is refused rather than carried', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/family/helpers.ts', source: HELPERS, importSource: './helpers.ts' },
		{
			filename: 'src/pages/helpers.ts',
			source: `export function shout(text) { return 'page:' + text; }`,
			importSource: './helpers.ts',
		},
		{ filename: 'src/family/box.tsrx', source: FAMILY, importSource: '../family/box.tsrx' },
		{
			filename: 'src/pages/page.tsrx',
			source: pageReading('b.loud + shout("here")', `import { shout } from './helpers.ts';`),
		},
	]);
	const page = results.at(-1)!;
	const said = errors(page)
		.map((item) => item.message)
		.join('\n');

	expect(said).toContain('"shout"');
	expect(said).toContain('src/family/box.tsrx');
	expect(said).toContain('./helpers.ts');
	expect(page.publicRenderModule.ssrModuleSource).not.toContain('../family/helpers.ts');
});

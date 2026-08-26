import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../../src/index.ts';
import { SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE } from '../../src/passes/symbol-modules.ts';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

// Fail-closed. What the client module cannot bind for a copied factory
// expression is refused at compile time, because the server renders the first
// paint correctly either way: left silent the gap surfaces as a ReferenceError
// on the first refresh or client write, with nothing at build time to point at.

const HELPERS = `
export function shout(text) { return String(text).toUpperCase(); }
`;

const CONSUMER_HELPERS = `
export function shout(text) { return 'consumer:' + text; }
`;

const FAMILY = `
import { shared, state, computed } from '@markless/core';
import { shout } from './helpers.ts';

const SUFFIX = '!';

export const box = shared(() => {
	const s = state({ label: 'a' });
	const loud = computed(() => shout(s.label));
	const banged = computed(() => s.label + SUFFIX);
	return { ...s, loud, banged };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.loud}</div>
}
`;

async function compileConsumer(consumer: string) {
	const results = await compileTsrxModulesWithInterfaces([
		{ filename: 'src/helpers.ts', source: HELPERS, importSource: './helpers.ts' },
		{
			filename: 'src/consumer-helpers.ts',
			source: CONSUMER_HELPERS,
			importSource: './consumer-helpers.ts',
		},
		{ filename: 'src/family.tsrx', source: FAMILY, importSource: './family.tsrx' },
		{ filename: 'src/consumer.tsrx', source: consumer },
	]);
	return results.at(-1)!;
}

function refusals(compiled: Awaited<ReturnType<typeof compileConsumer>>) {
	return collectTsrxModuleDiagnostics(compiled).filter(
		(item) =>
			item.severity === 'error' &&
			item.code === SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE_CODE &&
			item.passId === 'symbol-modules' &&
			item.title.includes('re-derived from another module'),
	);
}

test('an import of the same name from another file is refused, naming both', async () => {
	const compiled = await compileConsumer(`
import { box } from './family.tsrx';
import { shout } from './consumer-helpers.ts';

export default function Page() @{
	const b = box();
	<div>{b.loud + shout('local')}</div>
}
`);

	const said = refusals(compiled)
		.map((item) => `${item.title}\n${item.message}`)
		.join('\n');
	expect(refusals(compiled).length).toBeGreaterThan(0);
	expect(said).toContain('"shout"');
	expect(said).toContain('"loud"');
	expect(said).toContain('src/family.tsrx');
	expect(said).toContain('./consumer-helpers.ts');
	expect(said).toContain('matched against it by name alone');
});

test('a module-scope declaration of the same name in the reading file is refused', async () => {
	const compiled = await compileConsumer(`
import { box } from './family.tsrx';

const SUFFIX = '?';

export default function Page() @{
	const b = box();
	<div>{b.banged + SUFFIX}</div>
}
`);

	const said = refusals(compiled)
		.map((item) => item.message)
		.join('\n');
	expect(refusals(compiled).length).toBeGreaterThan(0);
	expect(said).toContain('"SUFFIX"');
	expect(said).toContain('a module-scope declaration in this file');
});

test('a carry that lands refuses nothing', async () => {
	const compiled = await compileConsumer(`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.loud}</div>
}
`);

	expect(refusals(compiled)).toEqual([]);
	const derive = compiled.symbolModules.modules.find(
		(module) =>
			module.kind === 'sync-computed-derive' && module.source.includes('shout(context.'),
	)!;
	expect(derive.source).toContain('import { shout } from "./helpers.ts";');
});

test('a name the definition record cannot explain is refused rather than left free', async () => {
	const results = await compileTsrxModulesWithInterfaces([
		{
			filename: 'src/unrecorded.tsrx',
			source: `
import { shared, state, computed } from '@markless/core';

export const dial = shared(() => {
	const s = state({ n: 1 });
	const named = computed(() => s.n + Dial.length);
	return { ...s, named };
}, { scope: 'widget' });

export default function Dial() @{
	const d = dial();
	<div data-dial>{d.named}</div>
}
`,
			importSource: './unrecorded.tsrx',
		},
		{
			filename: 'src/reader.tsrx',
			source: `
import { dial } from './unrecorded.tsrx';

export default function Page() @{
	const d = dial();
	<div>{d.named}</div>
}
`,
		},
	]);
	const compiled = results.at(-1)!;

	const said = refusals(compiled)
		.map((item) => item.message)
		.join('\n');
	expect(refusals(compiled).length).toBeGreaterThan(0);
	expect(said).toContain('"Dial"');
	expect(said).toContain('would throw a ReferenceError');
});

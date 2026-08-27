import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../../src/index.ts';
import { SHARED_COMPUTED_CROSS_MODULE_CODE } from '../../src/passes/public-render/derive-set.ts';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

// Serving a page that reads a factory computed works the value out by copying
// the factory's own expression into that page's module. Inside the defining
// file that is sound - the text lands back in the scope it was written in.
// Across files the scope has to travel too: the shared() definition record
// carries the imports and module constants the factory's text names, and the
// reading module emits the ones its copy still spells. The one shape that
// cannot be carried is a name the reading module already binds from somewhere
// else, because one module scope cannot hold two of it.

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
	const banged = computed(() => loud + SUFFIX);
	const plain = computed(() => s.label + '?');
	return { ...s, loud, banged, plain };
}, { scope: 'widget' });

export default function Family() @{
	const b = box();
	<div data-family>{b.banged}</div>
}
`;

async function compileWithFamily(consumer: string) {
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
	return { family: results[2]!, consumer: results.at(-1)! };
}

function errors(compiled: Parameters<typeof collectTsrxModuleDiagnostics>[0]) {
	return collectTsrxModuleDiagnostics(compiled).filter((item) => item.severity === 'error');
}

// The non-regression that matters most: the defining module still serves its
// own factory computed, and the module scope the copied expression needs is
// emitted beside it because all of it lives in one file.
test('the defining module still serves its own factory computed', async () => {
	const { family } = await compileWithFamily(
		`export default function Page() @{ <span>x</span> }`,
	);
	const ssr = family.publicRenderModule.ssrModuleSource;

	expect(errors(family)).toEqual([]);
	expect(ssr).toContain('from "./helpers.ts"');
	expect(ssr).toContain("const SUFFIX = '!'");
	expect(ssr).toContain('#box/computed:banged"');
});

test('a consumer reading a cell built on the family import compiles and carries it', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.loud}</div>
}
`);
	const ssr = consumer.publicRenderModule.ssrModuleSource;

	expect(errors(consumer)).toEqual([]);
	expect(ssr).toContain('import { shout } from "./helpers.ts";');
	expect(ssr).toContain('#box/computed:loud"');
});

test('a module constant the copied expression names travels with it', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.banged}</div>
}
`);
	const ssr = consumer.publicRenderModule.ssrModuleSource;

	expect(errors(consumer)).toEqual([]);
	// `banged` names the module constant; its dependency `loud` names the import.
	expect(ssr).toContain("const SUFFIX = '!';");
	expect(ssr).toContain('import { shout } from "./helpers.ts";');
});

// The one half that still refuses: the reading file binds the same name from
// somewhere else, so the carry cannot land - the module would bind "shout"
// twice, and matching by name alone would build the served value from the
// consumer's function.
test('a consumer binding of the same name from another origin refuses, naming both', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';
import { shout } from './consumer-helpers.ts';

export default function Page() @{
	const b = box();
	<div>{b.loud + shout('local')}</div>
}
`);

	const captured = errors(consumer).filter(
		(item) => item.code === SHARED_COMPUTED_CROSS_MODULE_CODE,
	);
	expect(captured.length).toBeGreaterThan(0);
	const said = captured.map((item) => `${item.title}\n${item.message}`).join('\n');
	expect(said).toContain('"shout"');
	expect(said).toContain('"loud"');
	expect(said).toContain('src/family.tsrx');
	expect(said).toContain('./consumer-helpers.ts');
	expect(said).toContain('matched against it by name alone');
	expect(captured[0]?.title).toContain('cannot be read from another module yet');
	// Nothing is emitted for a name it refused to carry.
	expect(consumer.publicRenderModule.ssrModuleSource).not.toContain('from "./helpers.ts"');
});

// A cell written out of the factory's own state and platform globals needs
// nothing from the defining file's module scope, so it copies into any module
// unchanged - and carries nothing with it.
test('a self-contained cell is still readable from another module', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.plain}</div>
}
`);
	const ssr = consumer.publicRenderModule.ssrModuleSource;

	expect(errors(consumer)).toEqual([]);
	expect(ssr).toContain('#box/computed:plain"');
	expect(ssr).not.toContain('shout');
	expect(ssr).not.toContain('SUFFIX');
});

// Reading a plain state cell of the family copies no expression at all, so
// nothing about it can go out of scope.
test('reading a state cell across modules is untouched', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.label}</div>
}
`);

	expect(errors(consumer)).toEqual([]);
});

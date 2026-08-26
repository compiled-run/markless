import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics } from '../../src/index.ts';
import { SHARED_COMPUTED_CROSS_MODULE_CODE } from '../../src/passes/public-render/derive-set.ts';
import { compileTsrxModulesWithInterfaces } from '../multi-module-compile-support.ts';

// Serving a page that reads a factory computed works the value out by copying
// the factory's own expression into that page's module. Inside the defining
// file that is sound - the text lands back in the scope it was written in, and
// that file's imports and module constants are emitted beside it. Across files
// neither travels, and the copy is matched against the reading file's imports
// by name, so an expression that names anything at module scope either threw a
// ReferenceError while the page was served or was quietly built from the
// reading file's same-named value. These tests are the refusal, not the
// capability: carrying the definition file's module scope needs a field the
// shared() definition record does not have yet.

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
	const banged = computed(() => loud() + SUFFIX);
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

test('a consumer reading a cell built on the family import is refused, naming both', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.loud}</div>
}
`);

	const refusals = errors(consumer).filter(
		(item) => item.code === SHARED_COMPUTED_CROSS_MODULE_CODE,
	);
	expect(refusals.length).toBeGreaterThan(0);
	const said = refusals.map((item) => `${item.title}\n${item.message}`).join('\n');
	// The name the copied expression expects, the cell that dragged it in, and
	// the file it came from.
	expect(said).toContain('"shout"');
	expect(said).toContain('"loud"');
	expect(said).toContain('src/family.tsrx');
	expect(said).toContain('ReferenceError');
	expect(refusals[0]?.title).toContain('cannot be read from another module yet');
});

test('a module constant the copied expression names is refused the same way', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.banged}</div>
}
`);

	const named = errors(consumer)
		.filter((item) => item.code === SHARED_COMPUTED_CROSS_MODULE_CODE)
		.map((item) => item.message)
		.join('\n');
	// `banged` names the module constant; its dependency `loud` names the import.
	expect(named).toContain('"SUFFIX"');
	expect(named).toContain('"shout"');
});

// The worse half: the reading file happens to bind the same name, so the copy
// binds to the consumer's value and the served page is quietly built from a
// function the family never meant.
test('a consumer import the copied expression captures is refused as a capture', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';
import { shout } from './consumer-helpers.ts';

export default function Page() @{
	const b = box();
	<div>{b.loud + shout('local')}</div>
}
`);

	const captured = errors(consumer).filter(
		(item) =>
			item.code === SHARED_COMPUTED_CROSS_MODULE_CODE &&
			item.message.includes('matched against it by name alone'),
	);
	expect(captured.length).toBeGreaterThan(0);
	expect(captured[0]?.message).toContain('"shout"');
	expect(captured[0]?.message).toContain('src/family.tsrx');
});

// A cell written out of the factory's own state and platform globals needs
// nothing from the defining file's module scope, so it copies into any module
// unchanged - and must keep compiling, or the refusal would ban shared() cells
// across modules outright.
test('a self-contained cell is still readable from another module', async () => {
	const { consumer } = await compileWithFamily(`
import { box } from './family.tsrx';

export default function Page() @{
	const b = box();
	<div>{b.plain}</div>
}
`);

	expect(errors(consumer)).toEqual([]);
	expect(consumer.publicRenderModule.ssrModuleSource).toContain('#box/computed:plain"');
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

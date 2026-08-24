import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A component body may seed its widget's shared instance only from values the
// render already has: this component's own prop locals, and the six literal
// keywords. `isUnloweredSharedSeed` in `src/passes/state-lowering.ts` enforces
// that by scanning the seed's value source for identifiers.
//
// The scan reads code, so it must not read the *content* of a string: `'plain'`
// is text, not a name, and a string's characters can never make a seed
// unlowerable. Identifiers outside strings — including the code inside a
// template literal's `${}` — are still names, and still refused.

async function seedDiagnostics(filename: string, source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	return result.stateLowering.diagnostics.filter(
		(diagnostic) => diagnostic.code === 'MARKLESS_SHARED_SEED_UNSUPPORTED',
	);
}

/**
 * A seed shape that now reaches the emitter has to arrive there whole. Un-refused
 * is not the same as correct: the shared-seed emitter has no carry channel, so a
 * name the emitted module cannot bind would compile green and throw a
 * ReferenceError in the browser. `symbolModules` reports exactly that, so a clean
 * error list plus an emitted seed module is the evidence the shape is complete.
 */
async function emittedSeed(filename: string, source: string) {
	const result = await compileTsrxModule({ filename, source, symbols: [] });
	return {
		errors: [...result.stateLowering.diagnostics, ...result.symbolModules.diagnostics].filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
		seeds: result.symbolModules.modules.filter((module) => module.kind === 'shared-seed'),
	};
}

function moduleSource(body: string): string {
	return `
import { shared, state } from '@markless/core';

export const boxState = shared(() => {
	const box = state({ tag: '' });

	return { ...box };
}, { scope: 'widget' });

${body}
`;
}

test('a string literal seed is lowered even when its content spells an identifier', async () => {
	const { errors, seeds } = await emittedSeed(
		'/workspace/app/src/SeedStringLiteral.tsrx',
		moduleSource(`
export function BoxRoot() @{
	const box = boxState();
	box.tag = 'plain';

	<div ui-tag={box.tag} />
}
`),
	);

	expect(errors).toEqual([]);
	expect(seeds).toHaveLength(1);
	expect(seeds[0]!.source).toContain("'plain'");
});

test('a string literal whose content names a real module-scope const is still lowered', async () => {
	// The word inside the quotes matches a declaration that genuinely exists, so
	// this pins that the scan classifies by position, not by whether the text
	// happens to resolve.
	const diagnostics = await seedDiagnostics(
		'/workspace/app/src/SeedStringShadow.tsrx',
		`
import { shared, state } from '@markless/core';

const plain = 'not this one';

export const boxState = shared(() => {
	const box = state({ tag: '' });

	return { ...box };
}, { scope: 'widget' });

export function BoxRoot() @{
	const box = boxState();
	box.tag = 'plain';

	<div ui-tag={box.tag} />
}
`,
	);

	expect(diagnostics).toEqual([]);
});

test('an out-of-scope identifier in a seed is still refused loudly', async () => {
	const diagnostics = await seedDiagnostics(
		'/workspace/app/src/SeedModuleConst.tsrx',
		`
import { shared, state } from '@markless/core';

const TAG = 'box';

export const boxState = shared(() => {
	const box = state({ tag: '' });

	return { ...box };
}, { scope: 'widget' });

export function BoxRoot() @{
	const box = boxState();
	box.tag = TAG;

	<div ui-tag={box.tag} />
}
`,
	);

	expect(diagnostics).toHaveLength(1);
	expect(diagnostics[0]!.severity).toBe('error');
	expect(diagnostics[0]!.message).toContain('TAG');
});

test('an out-of-scope identifier inside a template interpolation is still refused', async () => {
	// Template text is blanked, but `${}` holds code: `TAG` there is a name the
	// emitted seed module would have to reach, and it has no carry channel.
	const diagnostics = await seedDiagnostics(
		'/workspace/app/src/SeedTemplateInterpolation.tsrx',
		`
import { shared, state } from '@markless/core';

const TAG = 'box';

export const boxState = shared(() => {
	const box = state({ tag: '' });

	return { ...box };
}, { scope: 'widget' });

export function BoxRoot() @{
	const box = boxState();
	box.tag = \`tag-\${TAG}\`;

	<div ui-tag={box.tag} />
}
`,
	);

	expect(diagnostics).toHaveLength(1);
	expect(diagnostics[0]!.severity).toBe('error');
});

test('a template literal whose text alone spells an identifier is lowered', async () => {
	const { errors, seeds } = await emittedSeed(
		'/workspace/app/src/SeedTemplateText.tsrx',
		moduleSource(`
export function BoxRoot() @{
	const box = boxState();
	box.tag = \`plain\`;

	<div ui-tag={box.tag} />
}
`),
	);

	expect(errors).toEqual([]);
	expect(seeds).toHaveLength(1);
	expect(seeds[0]!.source).toContain('plain');
});

test('a prop interpolated into a template seed is lowered', async () => {
	const diagnostics = await seedDiagnostics(
		'/workspace/app/src/SeedTemplateProp.tsrx',
		moduleSource(`
export function BoxRoot({ tag }) @{
	const box = boxState();
	box.tag = \`tag-\${tag}\`;

	<div ui-tag={box.tag} />
}
`),
	);

	expect(diagnostics).toEqual([]);
});

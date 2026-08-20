import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(filename: string, source: string) {
	return compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function errors(compiled: Awaited<ReturnType<typeof compile>>) {
	return compiled.stateLowering.diagnostics.filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

// A widget family whose factory declares exactly one graph field: `checked`.
// Anything a component body or a factory method reaches for beyond that field
// (an `onChange` callback slot, say) does not exist on the graph.
const unknownSeedSource = `
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true });
	return { ...s, toggle() { s.checked = !s.checked; } };
}, { scope: 'widget' });

export function Root(props) @{
	const s = spike();
	s.onChange = props.onChange;

	<div data-root ui-checked={s.checked}>{props.children}</div>
}
`;

test('a body seed of a field the shared definition never declared fails the compile closed', async () => {
	const compiled = await compile('src/unknown-seed.tsrx', unknownSeedSource);

	expect(errors(compiled)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_SHARED_SEED_UNKNOWN_FIELD',
			source: 's.onChange',
			message: expect.stringContaining('"onChange"'),
		}),
	]);
	expect(errors(compiled)[0]?.message).toContain('spike()');
});

test('the unlowerable seed never reaches the emitted server body', async () => {
	const compiled = await compile('src/unknown-seed.tsrx', unknownSeedSource);

	// `s` has no local in the emitted body: the raw assignment would throw
	// ReferenceError during SSR.
	expect(compiled.publicRenderModule.ssrModuleSource).not.toContain('s.onChange');
});

test('a factory-method read of a member the state never declared fails the compile closed', async () => {
	const compiled = await compile(
		'src/unknown-member.tsrx',
		`
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true });
	return { ...s, toggle() { s.checked = !s.checked; s.onChange?.(s.checked); } };
}, { scope: 'widget' });

export function Box() @{
	const s = spike();

	<button type="button" ui-checked={s.checked} onClick={() => s.toggle()}>x</button>
}
`,
	);

	expect(errors(compiled)).toEqual([
		expect.objectContaining({
			code: 'MARKLESS_SHARED_MEMBER_UNKNOWN',
			source: 's.onChange',
			message: expect.stringContaining('spike()'),
		}),
	]);
	expect(errors(compiled)[0]?.message).toContain('"onChange"');
	expect(
		compiled.stateLowering.reads.some((read) => read.source === 's.onChange'),
	).toBe(false);
});

test('a declared field seeds and a declared member reads without a diagnostic', async () => {
	const compiled = await compile(
		'src/known.tsrx',
		`
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true, disabled: false });
	return { ...s, toggle() { s.checked = !s.disabled && !s.checked; } };
}, { scope: 'widget' });

export function Root(props) @{
	const s = spike();
	s.disabled = props.disabled ?? false;

	<div data-root ui-checked={s.checked} onClick={() => s.toggle()} />
}
`,
	);

	expect(errors(compiled)).toEqual([]);
});

// state-lowering already owns dynamic paths; a computed property name must stay
// the dynamic-path error, not the unknown-member one.
test('a dynamic shared-instance path keeps its own dynamic-path diagnostic', async () => {
	const compiled = await compile(
		'src/dynamic.tsrx',
		`
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true });
	return { ...s, set(key, value) { s[key] = value; } };
}, { scope: 'widget' });

export function Root(props) @{
	const s = spike();

	<div data-root ui-checked={s.checked} onClick={() => s.set(props.key, true)} />
}
`,
	);

	const codes = errors(compiled).map((diagnostic) => diagnostic.code);
	expect(codes).toContain('MARKLESS_STATE_DYNAMIC_PATH_WRITE');
	expect(codes).not.toContain('MARKLESS_SHARED_MEMBER_UNKNOWN');
	expect(codes).not.toContain('MARKLESS_SHARED_SEED_UNKNOWN_FIELD');
});

test('a dynamic shared-instance read keeps its own dynamic-path diagnostic', async () => {
	const compiled = await compile(
		'src/dynamic-read.tsrx',
		`
import { shared, state } from '@markless/core';

export const spike = shared(() => {
	const s = state({ checked: true });
	return { ...s, mirror(key) { s.checked = s[key] === true; } };
}, { scope: 'widget' });

export function Root(props) @{
	const s = spike();

	<div data-root ui-checked={s.checked} onClick={() => s.mirror(props.key)} />
}
`,
	);

	const codes = errors(compiled).map((diagnostic) => diagnostic.code);
	expect(codes).toContain('MARKLESS_STATE_DYNAMIC_PATH_READ');
	expect(codes).not.toContain('MARKLESS_SHARED_MEMBER_UNKNOWN');
});

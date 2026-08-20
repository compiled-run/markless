import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(source: string) {
	return compileTsrxModule({
		filename: 'aliased-props.tsrx',
		source,
		symbols: [],
	});
}

test('public SSR renders preserve authored prop keys for simple aliases', async () => {
	const compiled = await compile(`
		export function Child({ label: displayLabel }) @{
			<span>{displayLabel}</span>
		}
	`);

	expect(compiled.semanticGraph.aliases).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: 'displayLabel', target: 'props.label' }),
		]),
	);
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'const { label: displayLabel } = props ?? {};',
	);
});

test('same-module child factories preserve authored prop keys for simple aliases', async () => {
	const compiled = await compile(`
		function Child({ label: displayLabel }) @{
			<span>{displayLabel}</span>
		}

		export function Parent() @{
			<div><Child label="ready" /></div>
		}
	`);

	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'const { label: displayLabel } = props ?? {};',
	);
});

test('a plain prop destructures under its own name', async () => {
	const plain = await compile(`
		export function Plain({ label }) @{
			<span>{label}</span>
		}
	`);

	expect(plain.publicRenderModule.ssrModuleSource).toContain('const { label } = props ?? {};');
});

test('a prop default is re-emitted on the body destructure, and a template read of it fails closed', async () => {
	const defaulted = await compile(`
		export function Defaulted({ label = "fallback" }) @{
			<span>{label}</span>
		}
	`);

	expect(defaulted.publicRenderModule.ssrModuleSource).toContain(
		'const { label = "fallback" } = props ?? {};',
	);
	// The template residue reads the prop cell, not the defaulted local, so the
	// read is an error rather than a silent undefined.
	expect(
		defaulted.stateLowering.diagnostics.filter(
			(diagnostic) => diagnostic.severity === 'error',
		),
	).toEqual([
		expect.objectContaining({ code: 'MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED' }),
	]);
});

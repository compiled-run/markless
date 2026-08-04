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

test('plain and default-value prop destructuring emission stays unchanged', async () => {
	const plain = await compile(`
		export function Plain({ label }) @{
			<span>{label}</span>
		}
	`);
	const defaulted = await compile(`
		export function Defaulted({ label = "fallback" }) @{
			<span>{label}</span>
		}
	`);

	for (const compiled of [plain, defaulted]) {
		expect(compiled.publicRenderModule.ssrModuleSource).toContain(
			'const { label } = props ?? {};',
		);
	}
});

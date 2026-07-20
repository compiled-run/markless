import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/compile-module.ts';

const compile = (source: string) =>
	compileTsrxModule({
		filename: 'frameless-guard-return.tsrx',
		source,
		symbols: [],
	});

test('element-valued guard returns emit an actionable public-render error', async () => {
	const source = `export function Guarded({ visible }) @{
	if (!visible) return <p>hidden</p>;

	<main>visible</main>
}`;
	const result = await compile(source);
	const diagnostic = result.publicRenderPlan.diagnostics.find(
		(item) => item.code === 'MARKLESS_ELEMENT_GUARD_RETURN_UNSUPPORTED',
	);
	const returnStart = source.indexOf('return <p>hidden</p>;');

	expect(diagnostic).toMatchObject({
		severity: 'error',
		phase: 'public-render',
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
		primarySpan: {
			filename: 'frameless-guard-return.tsrx',
			start: returnStart,
			end: returnStart + 'return <p>hidden</p>;'.length,
		},
	});
	expect(diagnostic?.message).toContain('element-valued guard return');
	expect(diagnostic?.why).toContain('one planned component root');
	expect(diagnostic?.suggestions[0]?.message).toContain('root-level @if/@else');
	expect(diagnostic?.docsUrl).toBe(
		'https://markless.dev/errors/MARKLESS_ELEMENT_GUARD_RETURN_UNSUPPORTED',
	);
});

test('null guard returns remain accepted', async () => {
	const result = await compile(`export function Guarded({ visible }) @{
	if (!visible) return null;

	<main>visible</main>
}`);

	expect(
		result.publicRenderPlan.diagnostics.some(
			(item) => item.code === 'MARKLESS_ELEMENT_GUARD_RETURN_UNSUPPORTED',
		),
	).toBe(false);
});

test.each([
	['fragment', '<><p>hidden</p></>'],
	['conditional', 'visible ? <p>a</p> : <p>b</p>'],
])('%s-valued guard returns fail closed', async (_shape, guardValue) => {
	const source = `export function Guarded({ visible }) @{
	if (!visible) return ${guardValue};

	<main>visible</main>
}`;
	const result = await compile(source);
	const diagnostic = result.publicRenderPlan.diagnostics.find(
		(item) => item.code === 'MARKLESS_ELEMENT_GUARD_RETURN_UNSUPPORTED',
	);

	expect(diagnostic).toMatchObject({
		severity: 'error',
		phase: 'public-render',
		passId: 'public-render-plan',
		artifactKeys: ['publicRenderPlan'],
	});
});

import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compile(source: string) {
	return compileTsrxModule({ filename: 'quoted-prop-keys.tsrx', source, symbols: [] });
}

function propReads(compiled: Awaited<ReturnType<typeof compile>>) {
	return compiled.stateLowering.reads
		.filter((read) => read.graphNodeId === 'prop:props')
		.map((read) => ({ source: read.source, path: read.path }));
}

test('a quoted, hyphenated prop key reads the prop it names', async () => {
	const compiled = await compile(`
		export function Thumb({ 'aria-label': label, "data-side": side }) @{
			<span title={label} ui-side={side}>{label}</span>
		}
	`);

	expect(compiled.semanticGraph.aliases).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: 'label', propPath: ['aria-label'] }),
			expect.objectContaining({ name: 'side', propPath: ['data-side'] }),
		]),
	);
	expect(propReads(compiled)).toEqual(
		expect.arrayContaining([
			{ source: 'label', path: ['aria-label'] },
			{ source: 'side', path: ['data-side'] },
		]),
	);
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'const { "aria-label": label, "data-side": side } = marklessSsrProps ?? {};',
	);
	expect(compiled.stateLowering.diagnostics).toEqual([]);
});

test('a quoted key leaves the rest pattern holding everything else', async () => {
	const compiled = await compile(`
		export function Thumb({ 'aria-label': label, ...rest }) @{
			<span {...rest}>{label}</span>
		}
	`);

	expect(compiled.semanticGraph.aliases).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ name: 'rest', excludedPaths: [['aria-label']] }),
		]),
	);
	expect(propReads(compiled)).toEqual(
		expect.arrayContaining([{ source: 'label', path: ['aria-label'] }]),
	);
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		'const { "aria-label": label, ...rest } = marklessSsrProps ?? {};',
	);
	const spreads = compiled.renderData.chunks
		.flatMap((chunk) => chunk.slots)
		.filter((slot) => slot.kind === 'spread-attributes');
	expect(spreads).toEqual([
		expect.objectContaining({
			excludeNames: expect.arrayContaining(['aria-label']),
			destructuredNames: ['aria-label'],
		}),
	]);
});

test('a quoted key with a default keeps the default and its template-read diagnostic', async () => {
	const compiled = await compile(`
		export function Thumb({ 'aria-label': label = 'Resize' }) @{
			<span>{label}</span>
		}
	`);

	expect(compiled.semanticGraph.aliases).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				name: 'label',
				propPath: ['aria-label'],
				defaultSource: "'Resize'",
			}),
		]),
	);
	expect(compiled.publicRenderModule.ssrModuleSource).toContain(
		`const { "aria-label": label = 'Resize' } = marklessSsrProps ?? {};`,
	);
	expect(
		compiled.stateLowering.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
	).toEqual([
		expect.objectContaining({ code: 'MARKLESS_STATE_DESTRUCTURE_DEFAULT_UNSUPPORTED' }),
	]);
});

test('a quoted key that is a plain name reads like the unquoted one', async () => {
	const quoted = await compile(`
		export function Thumb({ 'label': text }) @{
			<span>{text}</span>
		}
	`);

	expect(propReads(quoted)).toEqual([{ source: 'text', path: ['label'] }]);
});

test('a bracketed hyphenated read of whole props reads the prop it names', async () => {
	const compiled = await compile(`
		export function Thumb(props) @{
			<span title={props['aria-label']}>{props["data-side"]}</span>
		}
	`);

	expect(propReads(compiled)).toEqual([
		{ source: "props['aria-label']", path: ['aria-label'] },
		{ source: 'props["data-side"]', path: ['data-side'] },
	]);
});

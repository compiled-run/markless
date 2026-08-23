import { expect, test } from 'vitest';
import { collectTsrxModuleDiagnostics, compileTsrxModule } from '../src/index.ts';

async function compile(source: string) {
	return compileTsrxModule({
		filename: 'src/page.tsrx',
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
}

function templateSlots(compiled: Awaited<ReturnType<typeof compile>>, chunkId: string) {
	const chunk = compiled.renderData.chunks.find((candidate) => candidate.id === chunkId);
	return chunk && 'slots' in chunk ? chunk.slots : [];
}

function templateStatics(compiled: Awaited<ReturnType<typeof compile>>, chunkId: string) {
	const chunk = compiled.renderData.chunks.find((candidate) => candidate.id === chunkId);
	return chunk && 'statics' in chunk ? chunk.statics.join('') : '';
}

function errors(compiled: Awaited<ReturnType<typeof compile>>) {
	return collectTsrxModuleDiagnostics(compiled).filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
}

// A `{/* … */}` container is a comment, not a child. JSX lowers it to nothing;
// anything else emits `( /* … */ )`, an empty parenthesized expression that no
// downstream parse can read.
test('a comment container alone in children position lowers to nothing', async () => {
	const compiled = await compile(`
import { state } from '@markless/core';

export function Widget() @{
	const data = state({ n: 1 });

	<main>
		{/* only a comment */}
	</main>
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(templateSlots(compiled, 'template:Widget')).toEqual([]);
	expect(templateStatics(compiled, 'template:Widget')).toBe('<main></main>');
});

test('a comment container between elements leaves the siblings adjacent', async () => {
	const compiled = await compile(`
import { state } from '@markless/core';

export function Widget() @{
	const data = state({ n: 1 });

	<main>
		<span>a</span>
		{/* between */}
		<span>b</span>
	</main>
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(templateSlots(compiled, 'template:Widget')).toEqual([]);
	expect(templateStatics(compiled, 'template:Widget')).toBe(
		'<main><span>a</span><span>b</span></main>',
	);
});

// The surviving dynamic slot has to keep its own coordinate: a dropped comment
// must not shift the child-index path of the sibling that follows it.
test('a comment container does not shift a later dynamic slot coordinate', async () => {
	const commented = await compile(`
import { state } from '@markless/core';

export function Widget() @{
	const data = state({ n: 1 });

	<main>
		{/* leading */}
		<span>{data.n}</span>
		<button onClick={() => { data.n = data.n + 1; }}>go</button>
	</main>
}
`);
	const plain = await compile(`
import { state } from '@markless/core';

export function Widget() @{
	const data = state({ n: 1 });

	<main>
		<span>{data.n}</span>
		<button onClick={() => { data.n = data.n + 1; }}>go</button>
	</main>
}
`);

	expect(errors(commented)).toEqual([]);
	expect(templateSlots(commented, 'template:Widget')).toEqual(
		templateSlots(plain, 'template:Widget'),
	);
	expect(templateStatics(commented, 'template:Widget')).toBe(
		templateStatics(plain, 'template:Widget'),
	);
});

test('a comment container inside a construct arm lowers to nothing', async () => {
	const compiled = await compile(`
import { state } from '@markless/core';

export function Widget() @{
	const data = state({ open: true });

	<main>
		@if (data.open) {
			{/* inside the arm */}
			<span>open</span>
		} @else {
			{/* the other arm */}
			<span>shut</span>
		}
	</main>
}
`);

	expect(errors(compiled)).toEqual([]);
	const emitted = [
		compiled.publicRenderModule.moduleSource,
		compiled.publicRenderModule.ssrModuleSource,
		...compiled.symbolModules.modules.map((module) => module.source),
	].join('\n');
	expect(emitted).not.toContain('inside the arm');
	expect(emitted).not.toContain('the other arm');
	const armChunks = compiled.renderData.chunks.filter((chunk) => chunk.kind === 'branch-arm');
	expect(armChunks.map((chunk) => ('statics' in chunk ? chunk.statics.join('') : ''))).toEqual([
		'<span>open</span>',
		'<span>shut</span>',
	]);
	// The comment was the arm's first child; leaving it in would have added a
	// text slot ahead of the span in each arm.
	expect(armChunks.every((chunk) => ('slots' in chunk ? chunk.slots.length : 0) === 0)).toBe(true);
});

test('a multiline comment container lowers to nothing', async () => {
	const compiled = await compile(`
import { state } from '@markless/core';

export function Widget() @{
	const data = state({ n: 1 });

	<main>
		{/*
			a comment
			spanning several lines
			with <span>markup-looking</span> text
		*/}
		<span>a</span>
	</main>
}
`);

	expect(errors(compiled)).toEqual([]);
	expect(templateSlots(compiled, 'template:Widget')).toEqual([]);
	expect(templateStatics(compiled, 'template:Widget')).toBe('<main><span>a</span></main>');
});

// The whole point of the lowering is that nothing downstream ever sees the
// comment text, in any emitted artifact.
test('comment text never reaches an emitted artifact', async () => {
	const compiled = await compile(`
import { state } from '@markless/core';

export function Widget() @{
	const data = state({ n: 1 });

	<main>
		{/* SENTINEL_COMMENT_TEXT */}
		<span>{data.n}</span>
		<button onClick={() => { data.n = data.n + 1; }}>go</button>
	</main>
}
`);

	const emitted = [
		compiled.publicRenderModule.moduleSource,
		compiled.publicRenderModule.ssrModuleSource,
		...compiled.symbolModules.modules.map((module) => module.source),
		JSON.stringify(compiled.renderData),
		JSON.stringify(compiled.protocolState),
	].join('\n');
	expect(errors(compiled)).toEqual([]);
	expect(emitted).not.toContain('SENTINEL_COMMENT_TEXT');
});

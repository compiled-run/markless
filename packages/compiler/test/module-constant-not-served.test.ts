import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A value read only from module scope is in code the browser already has, so the
// page never carries it: resume derives it from the module when it is read.

async function compile(filename: string, source: string) {
	const compiled = await compileTsrxModule({
		filename,
		source,
		buildId: 'build',
		resolverId: 'resolver',
		symbols: [],
	});
	const errors = [...compiled.semanticGraph.diagnostics, ...compiled.stateLowering.diagnostics].filter(
		(diagnostic) => diagnostic.severity === 'error',
	);
	expect(errors).toEqual([]);
	return compiled;
}

function servedGraphNodeIds(compiled: Awaited<ReturnType<typeof compile>>) {
	const ssr = [
		...(compiled.publicRenderModule.ssrModuleSource ?? '').matchAll(
			/marklessSsrServeComputed\(marklessSsrPayloadState, marklessSsrRenderStateValues, (\[[^\]]*\])/g,
		),
	].flatMap((match) => JSON.parse(match[1]!) as string[]);
	const csr = compiled.publicRenderModule.componentDefinitions.flatMap((definition) =>
		((definition.servedComputedIndexes as ReadonlyArray<number> | undefined) ?? []).map(
			(index) => compiled.protocolState.computed[index]!.graphNodeId,
		),
	);
	return { ssr, csr };
}

function liftedIds(compiled: Awaited<ReturnType<typeof compile>>, sources: ReadonlyArray<string>) {
	return compiled.semanticGraph.graphBindings.flatMap((binding) =>
		binding.functionSource !== undefined && sources.includes(binding.functionSource)
			? [binding.id]
			: [],
	);
}

test('an imported constant an arm shows or a list repeats is not served into the page', async () => {
	const compiled = await compile(
		'src/Drawing.tsrx',
		`
import { state } from '@markless/core';
import { art } from './drawing.art.ts';

const SHADOW = art.shadow + 'Z';

export function Drawing() @{
	let open = state(false);
	let picked = state('');
	<figure>
		<button onClick={() => (open = !open)}>Flip</button>
		@if (open) {
			<svg><path d={art.ink} /><path d={SHADOW} /></svg>
		}
		<ul>
			@for (const piece of art.pieces; key piece.id) {
				<li onClick={() => (picked = piece.id)}><svg><path d={piece.d} /></svg></li>
			}
		</ul>
		<output>{picked}</output>
	</figure>
}
`,
	);
	const constants = liftedIds(compiled, ['() => art.ink', '() => SHADOW', '() => art.pieces']);
	expect(constants).toHaveLength(3);
	const { ssr, csr } = servedGraphNodeIds(compiled);
	expect(ssr.filter((id) => constants.includes(id))).toEqual([]);
	expect(csr.filter((id) => constants.includes(id))).toEqual([]);
});

test('an arm value that also reads a prop is still served', async () => {
	const compiled = await compile(
		'src/Tagged.tsrx',
		`
import { state } from '@markless/core';
import { art } from './drawing.art.ts';

export function Tagged(props: { tag: string }) @{
	let open = state(false);
	<p>
		<button onClick={() => (open = !open)}>Flip</button>
		@if (open) { <svg><path d={art.ink + props.tag} /></svg> }
	</p>
}
`,
	);
	const [tagged] = liftedIds(compiled, ['() => art.ink + props.tag']);
	expect(tagged).toBeDefined();
	expect(servedGraphNodeIds(compiled).ssr).toContain(tagged);
});

/**
 * A handler body that is nothing but the calls the eager sync policy already
 * lifted (specs/framework/04-events-symbols-behaviors.md:214-255) leaves no
 * residual work, so the event keeps its policy and drops its lazy symbol.
 *
 * The braced and concise spellings of the same handler must land on the same
 * record: the concise one used to fail the emit gate because deleting its only
 * expression left `(event) => ` behind.
 */
import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

async function compileSubmit(name: string, handler: string) {
	return compileTsrxModule({
		filename: `src/${name}.tsrx`,
		source: `export function ${name}() @{
	<form onSubmit={${handler}}>
		<button>Go</button>
	</form>
}`,
		symbols: [],
	});
}

const policyOnly = {
	concise: '(event) => event.preventDefault()',
	braced: '(event) => { event.preventDefault(); }',
	guarded: `(event) => { if (event.submitter === 'publish') event.preventDefault(); }`,
} as const;

for (const [name, handler] of Object.entries(policyOnly)) {
	test(`a ${name} policy-only submit handler keeps its policy and drops its symbol`, async () => {
		const result = await compileSubmit(`Submit${name}`, handler);

		expect(result.captureAnalysis.diagnostics).toEqual([]);
		expect(result.semanticGraph.diagnostics).toEqual([]);
		expect(result.protocolView.events).toHaveLength(1);
		expect(result.protocolView.events[0]).toEqual(
			expect.objectContaining({
				eventName: 'submit',
				symbolIds: [],
				syncPolicy: expect.objectContaining({ actions: ['preventDefault'] }),
			}),
		);
		expect(result.symbolModules.modules).toEqual([]);
		expect(result.captureAnalysis.extractedSymbols).toEqual([]);
	});
}

test('the concise and braced spellings compile to the same event record', async () => {
	const concise = await compileSubmit('SubmitSame', policyOnly.concise);
	const braced = await compileSubmit('SubmitSame', policyOnly.braced);

	expect(concise.protocolView.events).toEqual(braced.protocolView.events);
	expect(concise.symbolModules.modules).toEqual(braced.symbolModules.modules);
	expect(concise.payloadScripts.viewScript).toEqual(braced.payloadScripts.viewScript);
});

test('a policy-only handler in a multi-binding list drops only its own symbol', async () => {
	const result = await compileTsrxModule({
		filename: 'src/MultiBinding.tsrx',
		source: `import { state } from '@markless/core';
export function MultiBinding() @{
	let saves = state(0);
	<button onClick={[(event) => event.preventDefault(), () => { saves = saves + 1; }]}>{saves}</button>
}`,
		symbols: [],
	});

	expect(result.captureAnalysis.diagnostics).toEqual([]);
	// The surviving handler slides down into slot 0; a hole here would serialize
	// as a null symbol id.
	expect(result.protocolView.events[0]?.symbolIds).toHaveLength(1);
	const handlers = result.symbolModules.modules.filter(
		(module) => module.kind === 'event-handler',
	);
	expect(handlers).toHaveLength(1);
	expect(handlers[0]?.source).toContain('context.graph.write');
});

test('a handler with work left over keeps its symbol and loses only the lifted calls', async () => {
	const result = await compileTsrxModule({
		filename: 'src/Residual.tsrx',
		source: `import { state } from '@markless/core';
export function Residual() @{
	let saved = state(false);
	<form onSubmit={(event) => { event.preventDefault(); saved = true; }}>
		<button>Go</button>
		{saved}
	</form>
}`,
		symbols: [],
	});

	expect(result.captureAnalysis.diagnostics).toEqual([]);
	expect(result.protocolView.events[0]?.symbolIds).toHaveLength(1);
	expect(result.symbolModules.modules[0]?.source).not.toContain('preventDefault');
	expect(result.symbolModules.modules[0]?.source).toContain('marklessWriteScalar');
});

test('a guarded policy with real work in its else arm stays syntactically whole', async () => {
	const result = await compileTsrxModule({
		filename: 'src/GuardedElse.tsrx',
		source: `import { state } from '@markless/core';
export function GuardedElse() @{
	let saved = state(0);
	<form onSubmit={(event) => {
		if (event.submitter === 'publish') event.preventDefault();
		else saved = saved + 1;
	}}>
		<button value="publish">Go</button>
		{saved}
	</form>
}`,
		symbols: [],
	});

	expect(result.captureAnalysis.diagnostics).toEqual([]);
	expect(result.symbolModules.modules[0]?.source).not.toContain('preventDefault');
	// The emptied consequent keeps an empty statement so the `else` still parses.
	expect(result.symbolModules.modules[0]?.source).toContain(
		`if (event.submitter === 'publish') ; else`,
	);
	expect(result.symbolModules.modules[0]?.source).toContain('context.graph.write');
});

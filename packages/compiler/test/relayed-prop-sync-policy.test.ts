import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A child that hands its own prop to an event as is (`onSubmit={props.onSave}`) runs the consumer's
// handler there, so the consumer's preventDefault has to reach that element as a sync policy.

const cancel = {
	when: { type: 'constant-truthy', value: true },
	actions: ['preventDefault'],
};

const child = (props: string, handler: string) => `
export default function SaveForm(${props}) @{
	<section>
		<form onSubmit={${handler}}>
			<button type="submit">Save</button>
		</form>
	</section>
}
`;

const parent = `
import { state } from '@markless/core';
import SaveForm from './save-form.tsrx';

export default function Page() @{
	let saved = state(0);
	<main>
		<p>{saved}</p>
		<SaveForm onSave={async (event) => { event.preventDefault(); saved += 1; }} />
		<SaveForm onSave={() => { saved += 10; }} />
	</main>
}
`;

async function compileChild(props: string, handler: string) {
	return compileTsrxModule({
		filename: 'src/save-form.tsrx',
		source: child(props, handler),
		symbols: [],
	});
}

for (const [shape, props, handler] of [
	['props member', 'props: { onSave: (event: SubmitEvent) => void }', 'props.onSave'],
	['destructured', '{ onSave }: { onSave: (event: SubmitEvent) => void }', 'onSave'],
	['renamed', '{ onSave: save }: { onSave: (event: SubmitEvent) => void }', 'save'],
] as const) {
	test(`a ${shape} prop handed to onSubmit is a relay host on the child's interface`, async () => {
		const { moduleGraphInterface } = await compileChild(props, handler);
		const form = moduleGraphInterface.render.components[0]!;
		expect(form.relayHosts).toEqual([
			{ hostNodeId: expect.any(String), eventName: 'submit', propName: 'onSave' },
		]);
	});

	test(`the parent states the cancel of the handler it passes on a ${shape} relay host, per edge`, async () => {
		const saveForm = await compileChild(props, handler);
		const page = await compileTsrxModule({
			filename: 'src/page.tsrx',
			source: parent,
			symbols: [],
			importedModuleInterfaces: { './save-form.tsrx': saveForm.moduleGraphInterface },
		});
		const relay = saveForm.moduleGraphInterface.render.components[0]!.relayHosts![0]!;
		expect(page.semanticGraph.diagnostics).toEqual([]);
		const cancelling = page.semanticGraph.componentEdges[0]!;
		expect(page.protocolView.events.filter((event) => event.eventName === 'submit')).toEqual([
			{
				hostNodeId: `c0:${relay.hostNodeId}`,
				eventName: 'submit',
				symbolIds: [],
				syncPolicy: cancel,
				componentEdgeId: cancelling.id,
			},
		]);
		expect(page.protocolView.locators).toContainEqual(
			expect.objectContaining({
				hostNodeId: `c0:${relay.hostNodeId}`,
				componentEdgeId: cancelling.id,
			}),
		);
	});
}

test('a child that wraps the prop in its own handler is not a relay host', async () => {
	const { moduleGraphInterface } = await compileChild(
		'props: { onSave: (event: SubmitEvent) => void }',
		'(event) => { props.onSave(event); }',
	);
	expect(moduleGraphInterface.render.components[0]!.relayHosts).toBeUndefined();
});

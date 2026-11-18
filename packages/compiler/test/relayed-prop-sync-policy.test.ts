import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A child that hands its own prop to an event as is (`onSubmit={props.onSave}`) runs the consumer's
// handler there, so the consumer's preventDefault has to reach that element as a sync policy.

const cancel = {
	when: { type: 'constant-truthy', value: true },
	actions: ['preventDefault'],
};

const formChild = (props: string, handler: string, around = (form: string) => form) => `
import { state } from '@markless/core';

export default function SaveForm(${props}) @{
	let rows = state([{ id: 'a' }]);
	let open = state(true);
	<section>
		<button type="button" onClick={() => (open = !open)}>Toggle</button>
		${around(`<form onSubmit={${handler}}><button type="submit">Save</button></form>`)}
	</section>
}
`;

const memberProps = 'props: { onSave: (event: SubmitEvent) => void }';

async function compile(filename: string, source: string, imports: Record<string, unknown> = {}) {
	return compileTsrxModule({
		filename,
		source,
		symbols: [],
		importedModuleInterfaces: imports as never,
	});
}

const childInterface = async (source: string) =>
	(await compile('src/save-form.tsrx', source)).moduleGraphInterface;

const errorsOf = (result: Awaited<ReturnType<typeof compile>>) =>
	result.semanticGraph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');

for (const [shape, props, handler] of [
	['props member', memberProps, 'props.onSave'],
	['destructured', '{ onSave }: { onSave: (event: SubmitEvent) => void }', 'onSave'],
	['renamed', '{ onSave: save }: { onSave: (event: SubmitEvent) => void }', 'save'],
] as const)
	test(`a ${shape} prop handed to onSubmit is a relayed prop on the child's interface and its record`, async () => {
		const child = await compile('src/save-form.tsrx', formChild(props, handler));
		expect(child.moduleGraphInterface.render.components[0]!.relayedProps).toEqual(['onSave']);
		expect(child.protocolView.events).toContainEqual(
			expect.objectContaining({ eventName: 'submit', relayedProp: 'onSave' }),
		);
	});

test('a form in an @if arm or a @for row of the child relays the prop on the arm and row records', async () => {
	const armed = await compile(
		'src/save-form.tsrx',
		formChild(memberProps, 'props.onSave', (form) => `@if (open) { ${form} }`),
	);
	expect(armed.moduleGraphInterface.render.components[0]!.relayedProps).toEqual(['onSave']);
	const arms = (armed.protocolView.branches ?? []).flatMap((branch) =>
		(branch.armRecords ?? []).flatMap((arm) => arm.events),
	);
	expect(arms).toContainEqual(
		expect.objectContaining({ eventName: 'submit', relayedProp: 'onSave' }),
	);

	const rowed = await compile(
		'src/save-form.tsrx',
		formChild(
			memberProps,
			'props.onSave',
			(form) => `<ul>@for (const row of rows; key row.id) { <li>${form}</li> }</ul>`,
		),
	);
	expect(rowed.moduleGraphInterface.render.components[0]!.relayedProps).toEqual(['onSave']);
	expect(
		(rowed.protocolView.keyedRepeats ?? []).flatMap((repeat) => repeat.rowEvents),
	).toContainEqual(expect.objectContaining({ eventName: 'submit', relayedProp: 'onSave' }));
});

test('a child that wraps the prop in its own handler relays nothing', async () => {
	const child = await childInterface(
		formChild(memberProps, '(event) => { props.onSave(event); }'),
	);
	expect(child.render.components[0]!.relayedProps).toBeUndefined();
});

test('a middle component passing its own prop on as is relays it too, imported or in the same file, under its own name', async () => {
	const saveForm = await childInterface(formChild(memberProps, 'props.onSave'));
	const toolbar = await compile(
		'src/toolbar.tsrx',
		`import SaveForm from './save-form.tsrx';
export default function Toolbar(props: { onCommit: (event: SubmitEvent) => void }) @{
	<div><SaveForm onSave={props.onCommit} /></div>
}
`,
		{ './save-form.tsrx': saveForm },
	);
	expect(toolbar.moduleGraphInterface.render.components[0]!.relayedProps).toEqual(['onCommit']);

	const sameFile = await compile(
		'src/panel.tsrx',
		`function Editor({ onSubmit }: { onSubmit: (event: SubmitEvent) => void }) @{
	<form onSubmit={onSubmit}><button type="submit">Save</button></form>
}
function Inner({ onGo }: { onGo: (event: SubmitEvent) => void }) @{
	<aside><Editor onSubmit={onGo} /></aside>
}
export default function Panel({ onSend: send }: { onSend: (event: SubmitEvent) => void }) @{
	<div><Inner onGo={send} /></div>
}
`,
	);
	const relayed = Object.fromEntries(
		sameFile.moduleGraphInterface.render.components.map((component) => [
			component.componentName,
			component.relayedProps,
		]),
	);
	expect(relayed).toEqual({ Editor: ['onSubmit'], Inner: ['onGo'], Panel: ['onSend'] });
});

const page = (handler: string) => `
import { state } from '@markless/core';
import Toolbar from './toolbar.tsrx';

export default function Page() @{
	let saved = state(0);
	<main><p>{saved}</p><Toolbar onCommit={${handler}} /></main>
}
`;

async function pageThroughToolbar(handler: string, child = formChild(memberProps, 'props.onSave')) {
	const saveForm = await childInterface(child);
	const toolbar = await compile(
		'src/toolbar.tsrx',
		`import SaveForm from './save-form.tsrx';
export default function Toolbar(props: { onCommit: (event: SubmitEvent) => void }) @{
	<div><SaveForm onSave={props.onCommit} /></div>
}
`,
		{ './save-form.tsrx': saveForm },
	);
	return compile('src/page.tsrx', page(handler), {
		'./toolbar.tsrx': toolbar.moduleGraphInterface,
	});
}

test('the parent sends the cancel of the handler it passes with that prop, and the page loads the sync policy runtime', async () => {
	const result = await pageThroughToolbar(
		`async (event) => { event.preventDefault(); saved += 1; }`,
	);
	expect(errorsOf(result)).toEqual([]);
	expect(result.semanticGraph.componentEdges[0]!.props).toContainEqual(
		expect.objectContaining({ name: 'onCommit', kind: 'callback', syncPolicy: cancel }),
	);
	for (const map of Object.values(result.runtimeDemandMaps))
		expect(map.capabilityModuleIds).toContain('web/inline/sync-policy-core');
});

test('a page passing no cancel does not load the sync policy runtime for it', async () => {
	const result = await pageThroughToolbar(`() => { saved += 1; }`);
	for (const map of Object.values(result.runtimeDemandMaps))
		expect(map.capabilityModuleIds ?? []).not.toContain('web/inline/sync-policy-core');
});

for (const [why, handler, code] of [
	[
		'reads the DOM in its guard',
		`(event) => { if ((event.target as HTMLElement).closest('a')) event.preventDefault(); saved += 1; }`,
		'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
	],
	[
		'detaches preventDefault',
		`(event) => { const stop = event.preventDefault; stop(); saved += 1; }`,
		'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
	],
	[
		'cancels a nested event of the same name',
		`(event) => { event.preventDefault(); { const event = { preventDefault: () => (saved = 7) }; event.preventDefault(); } }`,
		'MARKLESS_SYNC_POLICY_SECOND_CANCEL',
	],
] as const) {
	test(`a cancel that ${why} passed through a middle component to a form is refused`, async () => {
		const result = await pageThroughToolbar(handler);
		expect(errorsOf(result).map((diagnostic) => diagnostic.code)).toEqual([code]);
	});

	test(`a cancel that ${why} passed to a form in a child's @for row is refused`, async () => {
		const result = await pageThroughToolbar(
			handler,
			formChild(
				memberProps,
				'props.onSave',
				(form) => `<ul>@for (const row of rows; key row.id) { <li>${form}</li> }</ul>`,
			),
		);
		expect(errorsOf(result).map((diagnostic) => diagnostic.code)).toEqual([code]);
	});
}

test('a cancel the compiler cannot place passed to a same-file child that relays it is refused', async () => {
	const result = await compile(
		'src/page.tsrx',
		`import { state } from '@markless/core';
export default function Page() @{
	let saved = state(0);
	<main><p>{saved}</p><Editor onSubmit={(event) => { if ((event.target as HTMLElement).closest('a')) event.preventDefault(); saved += 1; }} /></main>
}
function Editor({ onSubmit }: { onSubmit: (event: SubmitEvent) => void }) @{
	<form onSubmit={onSubmit}><button type="submit">Save</button></form>
}
`,
	);
	expect(errorsOf(result).map((diagnostic) => diagnostic.code)).toEqual([
		'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
	]);
});

test('the same callback passed to a child that does not hand it to an event compiles as before', async () => {
	const result = await pageThroughToolbar(
		`(event) => { if ((event.target as HTMLElement).closest('a')) event.preventDefault(); saved += 1; }`,
		formChild(memberProps, '(event) => { props.onSave(event); }'),
	);
	expect(errorsOf(result)).toEqual([]);
});

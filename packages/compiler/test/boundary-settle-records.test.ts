import { expect, test } from 'vitest';
import { compileTsrxModule } from '../src/index.ts';

// A boundary update module returns the records of the arm it renders, as a served arm carries them.

async function boundaryModule(source: string) {
	const result = await compileTsrxModule({ filename: 'src/Pier.tsrx', source, symbols: [] });
	const module = result.symbolModules.modules.find(
		(candidate) => candidate.kind === 'async-boundary-update',
	);
	if (!module) throw new Error('Expected an async-boundary-update module.');
	return { result, module };
}

function runModule(code: string, exportName: string, context: Record<string, unknown>): any {
	const body = `${code.replaceAll(/^export /gm, '')}\nreturn ${exportName};`;
	return (new Function(body)() as (context: unknown) => unknown)(context);
}

function graphOf(values: Record<string, unknown>) {
	return {
		read(graphNodeId: string, path: ReadonlyArray<string>) {
			return path.reduce<any>((value, key) => value?.[key], values[graphNodeId]);
		},
	};
}

const pierSource = `
import { computed, state } from '@markless/core';

export function Pier() @{
	let waves = state(0);
	const pier = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 1));
		return { label: 'North', gulls: [{ id: 'a', call: 'caw' }] };
	});

	<div>
		@try {
			<aside>
				<ul>
					@for (const gull of pier.gulls; key gull.id) {
						<li><i>{gull.call}</i></li>
					}
				</ul>
				<button onClick={() => waves++}>{pier.label}</button>
				<small>{waves}</small>
			</aside>
		} @pending {
			<p>Wait</p>
		} @catch {
			<strong>Gone</strong>
		}
	</div>
}`;

test('the settled arm carries its events, bindings and rows, with rows shifting later elements', async () => {
	const { result, module } = await boundaryModule(pierSource);
	const hostOf = (tagName: string) =>
		result.renderData!.hosts.find((host) => host.tagName === tagName)!.hostNodeId;
	const pier = { label: 'North', gulls: [{}, {}, {}] };
	const update = runModule(module.source, module.exportName, {
		status: 'fulfilled',
		graph: graphOf({ 'computed:pier': pier, 'state:waves': 0 }),
	});

	expect(update.arm).toBe(0);
	// Three rows of two elements each sit between the list and the button.
	expect(update.armRecords.locators).toEqual([
		{ hostNodeId: hostOf('aside'), index: 0, tagName: 'aside' },
		{ hostNodeId: hostOf('ul'), index: 1, tagName: 'ul' },
		{ hostNodeId: hostOf('button'), index: 8, tagName: 'button' },
		{ hostNodeId: hostOf('small'), index: 9, tagName: 'small' },
	]);
	expect(
		update.armRecords.events.map((event: any) => [event.hostNodeId, event.eventName]),
	).toEqual([[hostOf('button'), 'click']]);
	expect(
		update.armRecords.domUpdates.map((record: any) => [record.hostNodeId, record.target.kind]),
	).toEqual(
		expect.arrayContaining([
			[hostOf('button'), 'text'],
			[hostOf('small'), 'text'],
		]),
	);
	expect(
		update.armRecords.domUpdates.every((record: any) => typeof record.symbolId === 'string'),
	).toBe(true);
	expect(update.armRecords.keyedRepeats.map((repeat: any) => repeat.parentHostNodeId)).toEqual([
		hostOf('ul'),
	]);
});

test('a rejected settle returns the catch arm records', async () => {
	const { result, module } = await boundaryModule(pierSource);
	const update = runModule(module.source, module.exportName, {
		status: 'rejected',
		graph: graphOf({}),
	});
	expect(update.armRecords.locators).toEqual([
		{
			hostNodeId: result.renderData!.hosts.find((host) => host.tagName === 'strong')!
				.hostNodeId,
			index: 0,
			tagName: 'strong',
		},
	]);
});

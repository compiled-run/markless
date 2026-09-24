import { expect, test } from 'vitest';
import type {
	ProtocolStatePayload,
	ProtocolViewPayload,
} from '../../../packages/serializer/src/protocol.ts';
import { protocolStateVersion } from '../../../packages/serializer/src/protocol-constants.ts';
import { planMdxResumeGroups } from './mdx-resume-groups.ts';

function state(ids: string[]): ProtocolStatePayload {
	return {
		version: protocolStateVersion([]),
		cells: ids.map((graphNodeId) => ({
			graphNodeId,
			name: graphNodeId,
			valueKind: 'scalar',
			value: { version: 1, root: 0, records: [] },
		})),
		computed: [],
	};
}

function view(prefixes: string[]): ProtocolViewPayload {
	return {
		version: protocolStateVersion([]),
		locators: prefixes.map((prefix, index) => ({
			hostNodeId: prefix + 'control',
			strategy: 'dom-order',
			index: 7 + index * 13,
			tagName: index % 2 ? 'input' : 'button',
		})),
		events: prefixes.map((prefix) => ({
			hostNodeId: prefix + 'control',
			eventName: 'click',
			symbolIds: [prefix + 'symbol:change'],
		})),
		domUpdates: prefixes.map((prefix) => ({
			hostNodeId: prefix + 'control',
			graphNodeId: prefix + 'state:value',
			source: 'value',
			path: [],
			target: { kind: 'text' },
			symbolId: prefix + 'symbol:label',
		})),
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

test.each([
	['m3:', 'm8:'],
	['m11:c2:', 'm1:'],
])(
	'partitions independent rendered scopes %s and %s without renumbering DOM locators',
	(first, second) => {
		const firstState = state([first + 'state:value']);
		const secondState = state([second + 'state:value']);
		const fullState = state(
			[...firstState.cells, ...secondState.cells].map((cell) => cell.graphNodeId),
		);
		const fullView = view([second, first]);
		const original = structuredClone({ fullState, fullView });
		const result = planMdxResumeGroups({
			children: [
				{ prefix: first, state: firstState },
				{ prefix: second, state: secondState },
			],
			state: fullState,
			view: fullView,
		});

		expect(result.groups.map((group) => group.id)).toEqual([first, second]);
		expect(result.groups[0]).toMatchObject({
			graphNodeIds: [first + 'state:value'],
			state: firstState,
			view: {
				locators: [fullView.locators[1]],
				events: [fullView.events[1]],
				domUpdates: [fullView.domUpdates[1]],
			},
		});
		expect(result.remainder.state.cells).toEqual([]);
		expect(result.remainder.view.events).toEqual([]);
		expect({ fullState, fullView }).toEqual(original);
	},
);

test('page-owned state remains connected while an independent demo can be deferred', () => {
	const shared = state(['shared:settings/theme']);
	const local = state(['m4:state:value']);
	const fullState = state(['shared:settings/theme', 'm4:state:value']);
	const fullView = view(['m1:', 'm4:']);
	const result = planMdxResumeGroups({
		children: [
			{ prefix: 'm1:', state: shared },
			{ prefix: 'm4:', state: local },
		],
		state: fullState,
		view: fullView,
	});

	expect(result.groups.map((group) => group.id)).toEqual(['m4:']);
	expect(result.remainder.state.cells).toEqual([fullState.cells[0]]);
	expect(result.remainder.view.events).toEqual([fullView.events[0]]);
});

test('a record outside a scope that reads its cell keeps both records connected', () => {
	const local = state(['m2:state:value']);
	const original = view(['m2:', 'm6:']);
	const fullView = {
		...original,
		domUpdates: original.domUpdates.map((record) => ({
			...record,
			graphNodeId: 'm2:state:value',
		})),
	};
	const result = planMdxResumeGroups({
		children: [{ prefix: 'm2:', state: local }],
		state: local,
		view: fullView,
	});
	expect(result.groups).toEqual([]);
	expect(result.remainder.view).toBe(fullView);
});

test('a computed outside the child retains its dependency in the common graph', () => {
	const local = state(['m2:state:value']);
	const fullState: ProtocolStatePayload = {
		...local,
		computed: [
			{
				graphNodeId: 'm9:computed:double',
				name: 'double',
				async: false,
				dependencies: [{ graphNodeId: 'm2:state:value', path: [] }],
			},
		],
	};
	expect(
		planMdxResumeGroups({
			children: [{ prefix: 'm2:', state: local }],
			state: fullState,
			view: view(['m2:']),
		}).groups,
	).toEqual([]);
});

test.each(['m2:', 'm2:c0:'])('overlapping child ownership %s stays together', (second) => {
	const local = state(['m2:state:value']);
	expect(
		planMdxResumeGroups({
			children: [
				{ prefix: 'm2:', state: local },
				{ prefix: second, state: local },
			],
			state: local,
			view: view(['m2:']),
		}).groups,
	).toEqual([]);
});

test('automatic visibility activation is not deferred behind another interaction', () => {
	const local = state(['m2:state:value']);
	const original = view(['m2:']);
	const fullView = {
		...original,
		events: original.events.map((event) => ({ ...event, eventName: 'visible' })),
	};
	expect(
		planMdxResumeGroups({
			children: [{ prefix: 'm2:', state: local }],
			state: local,
			view: fullView,
		}).groups,
	).toEqual([]);
});

test('state values are user data, not graph dependency declarations', () => {
	const original = state(['m2:state:value']);
	const local = {
		...original,
		cells: original.cells.map((cell) => ({
			...cell,
			value: { graphNodeId: 'shared:not-a-dependency' },
		})),
	};
	expect(
		planMdxResumeGroups({
			children: [{ prefix: 'm2:', state: local }],
			state: local,
			view: view(['m2:']),
		}).groups,
	).toHaveLength(1);
});

test('page storage referencing a child cell prevents isolation', () => {
	const local = state(['m2:state:value']);
	const storage = [{ graphNodeId: 'm2:state:value', key: 'preference' }];
	expect(
		planMdxResumeGroups({
			children: [{ prefix: 'm2:', state: local }],
			state: { ...local, version: protocolStateVersion(storage), storage },
			view: view(['m2:']),
		}).groups,
	).toEqual([]);
});

test('a child inventory must include the owned cells present in the composed payload', () => {
	const local = state(['m2:state:value']);
	expect(
		planMdxResumeGroups({
			children: [{ prefix: 'm2:', state: local }],
			state: state(['m2:state:value', 'm2:state:extra']),
			view: view(['m2:']),
		}).groups,
	).toEqual([]);
});

test('a child inventory cannot introduce a cell absent from the composed payload', () => {
	const local = state(['m2:state:value', 'm2:state:phantom']);
	expect(
		planMdxResumeGroups({
			children: [{ prefix: 'm2:', state: local }],
			state: state(['m2:state:value']),
			view: view(['m2:']),
		}).groups,
	).toEqual([]);
});

function widget(prefix: string): ProtocolStatePayload {
	const local = state([prefix + 'state:value']);
	return {
		...local,
		sharedDefinitions: [
			{
				id: prefix + 'shared:control',
				name: 'control',
				exportedName: 'control',
				scope: 'widget',
				version: 0,
				graphNodeIds: [prefix + 'state:value', prefix + 'element:items'],
			},
		],
	};
}

test.each(['m7:', 'm12:c3:'])('keeps owned widget handles inside %s', (prefix) => {
	const local = widget(prefix);
	const original = view([prefix]);
	const fullView = {
		...original,
		elementHandles: [
			{
				hostNodeId: prefix + 'control',
				handleId: prefix + 'element:items',
				name: 'items',
				plural: true,
			},
		],
	};
	const result = planMdxResumeGroups({
		children: [{ prefix, state: local }],
		state: local,
		view: fullView,
	});
	expect(result.groups).toHaveLength(1);
	expect(result.groups[0]?.view.elementHandles).toEqual(fullView.elementHandles);
	expect(result.remainder.view.elementHandles).toEqual([]);
});

test.each(['m7:', 'm12:c3:'])(
	'seed aliases in %s need ownership, not a duplicate physical cell',
	(prefix) => {
		const local: ProtocolStatePayload = {
			...state([prefix + 'state:value']),
			sharedSeeds: [
				{
					graphNodeId: prefix + 'state:value',
					deriveSymbolId: prefix + 'symbol:seed',
					dependencies: [
						{
							graphNodeId: prefix + 'state:value',
							path: [],
							reads: { graphNodeId: prefix + 'prop:input', path: ['value'] },
						},
					],
				},
			],
		};
		expect(
			planMdxResumeGroups({
				children: [{ prefix, state: local }],
				state: local,
				view: view([prefix]),
			}).groups,
		).toHaveLength(1);
	},
);

test.each([
	'update symbol',
	'derive symbol',
	'incoming symbol',
	'definition dependency',
	'definition inventory',
	'handle owner',
	'incoming handle',
	'missing host',
	'seed alias',
	'opaque state',
	'duplicate cell',
	'page definition',
	'async runner',
])('refuses incomplete ownership: %s', (shape) => {
	const prefix = 'm7:';
	let local = widget(prefix);
	let fullState = local;
	let fullView = view([prefix, 'm9:']);
	if (shape === 'update symbol')
		fullView = {
			...fullView,
			domUpdates: fullView.domUpdates.map((record, index) =>
				index ? record : { ...record, symbolId: 'm9:symbol:update' },
			),
		};
	if (shape === 'derive symbol')
		local = fullState = {
			...local,
			computed: [
				{
					graphNodeId: prefix + 'computed:label',
					name: 'label',
					async: false,
					deriveSymbolId: 'm9:symbol:derive',
					dependencies: [],
				},
			],
		};
	if (shape === 'incoming symbol')
		fullView = {
			...fullView,
			events: fullView.events.map((record, index) =>
				index ? { ...record, symbolIds: [prefix + 'symbol:change'] } : record,
			),
		};
	if (shape === 'definition dependency')
		local = fullState = {
			...local,
			sharedDefinitions: local.sharedDefinitions!.map((record) => ({
				...record,
				dependencies: [{ definitionId: 'm9:shared:other', definitionName: 'other' }],
			})),
		};
	if (shape === 'definition inventory') fullState = { ...local, sharedDefinitions: [] };
	if (shape === 'handle owner')
		fullView = {
			...fullView,
			elementHandles: [
				{ hostNodeId: prefix + 'control', handleId: 'm9:element:items', name: 'items' },
			],
		};
	if (shape === 'incoming handle')
		fullView = {
			...fullView,
			elementHandles: [
				{ hostNodeId: 'm9:control', handleId: prefix + 'element:items', name: 'items' },
			],
		};
	if (shape === 'missing host')
		fullView = {
			...fullView,
			locators: fullView.locators.filter((record) => !record.hostNodeId.startsWith(prefix)),
		};
	if (shape === 'seed alias')
		local = fullState = {
			...local,
			sharedSeeds: [
				{
					graphNodeId: prefix + 'state:value',
					deriveSymbolId: prefix + 'symbol:seed',
					dependencies: [
						{
							graphNodeId: prefix + 'state:value',
							path: [],
							reads: { graphNodeId: 'm9:prop:input', path: [] },
						},
					],
				},
			],
		};
	if (shape === 'opaque state')
		local = fullState = {
			...local,
			cells: local.cells.map((cell) => ({ ...cell, valueKind: 'unknown' })),
		};
	if (shape === 'duplicate cell')
		local = fullState = { ...local, cells: [...local.cells, local.cells[0]!] };
	if (shape === 'page definition')
		local = fullState = {
			...local,
			sharedDefinitions: local.sharedDefinitions!.map((record) => ({
				...record,
				scope: 'page',
			})),
		};
	if (shape === 'async runner')
		fullView = {
			...fullView,
			asyncRunners: { [prefix + 'state:value']: prefix + 'symbol:run' },
		};
	const result = planMdxResumeGroups({
		children: [{ prefix, state: local }],
		state: fullState,
		view: fullView,
	});
	expect(result.groups).toEqual([]);
	expect(result.remainder).toEqual({ state: fullState, view: fullView });
});

test.each(['m3:', 'm12:c2:'])('accepts an explicitly witnessed local callback for %s', (prefix) => {
	const original = state([prefix + 'state:value']);
	const graphNodeId = prefix + 'c1:callback';
	const local: ProtocolStatePayload = {
		...original,
		cells: [
			...original.cells,
			{ graphNodeId, name: 'callback', valueKind: 'unknown', directValue: 'symbol:change' },
		],
	};
	const result = planMdxResumeGroups({
		children: [{ prefix, state: local }],
		state: local,
		view: view([prefix]),
		callbackBindings: [
			{ graphNodeId, value: 'symbol:change', symbolId: prefix + 'symbol:change' },
		],
	});
	expect(result.refusals).toEqual([]);
	expect(result.groups.map((group) => group.id)).toEqual([prefix]);
});

test('an explicitly witnessed absent callback has no outgoing dependency', () => {
	const local = state(['m4:state:value']);
	const graphNodeId = 'm4:c1:callback';
	const full: ProtocolStatePayload = {
		...local,
		cells: [...local.cells, { graphNodeId, name: 'callback', valueKind: 'unknown' }],
	};
	const result = planMdxResumeGroups({
		children: [{ prefix: 'm4:', state: full }],
		state: full,
		view: view(['m4:']),
		callbackBindings: [{ graphNodeId, value: undefined }],
	});
	expect(result.groups).toHaveLength(1);
});

test.each(['missing cell', 'duplicate', 'stale value', 'unresolved target', 'foreign target'])(
	'refuses %s in a rendered callback receipt',
	(kind) => {
		const original = state(['m4:state:value']);
		const graphNodeId = 'm4:c1:callback';
		const local: ProtocolStatePayload = {
			...original,
			cells: [
				...original.cells,
				{
					graphNodeId,
					name: 'callback',
					valueKind: 'unknown',
					directValue: 'symbol:change',
				},
			],
		};
		const binding = { graphNodeId, value: 'symbol:change', symbolId: 'm4:symbol:change' };
		const callbackBindings =
			kind === 'duplicate'
				? [binding, binding]
				: [
						{
							...binding,
							...(kind === 'missing cell' ? { graphNodeId: 'm4:missing' } : {}),
							...(kind === 'stale value' ? { value: 'symbol:old' } : {}),
							...(kind === 'unresolved target' ? { symbolId: undefined } : {}),
							...(kind === 'foreign target' ? { symbolId: 'm8:symbol:change' } : {}),
						},
					];
		const result = planMdxResumeGroups({
			children: [{ prefix: 'm4:', state: local }],
			state: local,
			view: view(['m4:']),
			callbackBindings,
		});
		expect(result.groups).toEqual([]);
		expect(result.refusals[0]?.reason).toBe(
			kind === 'foreign target' ? 'symbol-dependency' : 'callback-provenance',
		);
	},
);

test('a callback outside the candidate that invokes its symbol retains the common runtime', () => {
	const local = state(['m4:state:value']);
	const graphNodeId = 'm8:c1:callback';
	const full: ProtocolStatePayload = {
		...local,
		cells: [
			...local.cells,
			{
				graphNodeId,
				name: 'callback',
				valueKind: 'unknown',
				directValue: 'm4:symbol:change',
			},
		],
	};
	const result = planMdxResumeGroups({
		children: [{ prefix: 'm4:', state: local }],
		state: full,
		view: view(['m4:', 'm8:']),
		callbackBindings: [
			{ graphNodeId, value: 'm4:symbol:change', symbolId: 'm4:symbol:change' },
		],
	});
	expect(result.groups).toEqual([]);
	expect(result.refusals[0]).toMatchObject({
		reason: 'incoming-dependency',
		ids: ['m4:symbol:change'],
	});
});

test('an unwitnessed unknown cell outside the candidate still prevents separation', () => {
	const local = state(['m4:state:value']);
	const full: ProtocolStatePayload = {
		...local,
		cells: [
			...local.cells,
			{
				graphNodeId: 'm8:opaque',
				name: 'opaque',
				valueKind: 'unknown',
				directValue: 'm4:symbol:change',
			},
		],
	};
	const result = planMdxResumeGroups({
		children: [{ prefix: 'm4:', state: local }],
		state: full,
		view: view(['m4:', 'm8:']),
	});
	expect(result.groups).toEqual([]);
	expect(result.refusals[0]).toMatchObject({
		reason: 'opaque-cell-captures',
		ids: ['m8:opaque'],
	});
});

test('a witnessed callback must match the served encoded value', () => {
	const original = state(['m4:state:value']);
	const graphNodeId = 'm4:c1:callback';
	const local: ProtocolStatePayload = {
		...original,
		cells: [
			...original.cells,
			{
				graphNodeId,
				name: 'callback',
				valueKind: 'unknown',
				value: { version: 1, root: 'symbol:change', records: [] },
			},
		],
	};
	const input = {
		children: [{ prefix: 'm4:', state: local }],
		state: local,
		view: view(['m4:']),
	};
	expect(
		planMdxResumeGroups({
			...input,
			callbackBindings: [
				{ graphNodeId, value: 'symbol:change', symbolId: 'm4:symbol:change' },
			],
		}).groups,
	).toHaveLength(1);
	expect(
		planMdxResumeGroups({
			...input,
			callbackBindings: [{ graphNodeId, value: 'symbol:old', symbolId: 'm4:symbol:old' }],
		}).refusals[0]?.reason,
	).toBe('callback-provenance');
});

import { describe, expect, test } from 'vitest';
import { createProtocolStatePayload } from '../src/protocol-state.ts';
import {
	classifyResumeRecordDelta,
	mergeResumeRecordDelta,
} from '../src/resume-record-delta.ts';

const view = {
	version: 1 as const,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	asyncBoundaries: [],
};

function records(input: {
	readonly cellValue?: unknown;
	readonly propValue?: unknown;
	readonly computedValue?: unknown;
}) {
	return {
		state: createProtocolStatePayload({
			cells: [
				{
					graphNodeId: 'state:count',
					name: 'count',
					valueKind: 'scalar',
					value: input.cellValue ?? 0,
				},
				{
					graphNodeId: 'prop:props',
					name: 'props',
					valueKind: 'object',
					value: input.propValue ?? { route: '/music' },
				},
			],
			computed: [
				{
					graphNodeId: 'computed:label',
					name: 'label',
					async: true,
					snapshot: {
						status: 'fulfilled',
						version: 1,
						key: null,
						value: input.computedValue ?? 'Count 0',
					},
				},
			],
		}),
		view,
	};
}

test('classifies independently allocated equal resume records as an empty value delta', () => {
	expect(classifyResumeRecordDelta(records({}), records({}))).toEqual({ kind: 'empty' });
});

describe.each([
	['cell', { cellValue: 1 }],
	['computed', { computedValue: 'Count 1' }],
	['props', { propValue: { route: '/feed' } }],
] as const)('%s values', (_kind, requestChange) => {
	test('use the same value-diff rule and carry only the keyed divergent record', () => {
		const baseline = records({});
		const request = records(requestChange);
		const classification = classifyResumeRecordDelta(baseline, request);
		expect(classification.kind).toBe('divergent');
		if (classification.kind !== 'divergent') return;

		expect(classification.delta.state.cells).toEqual(
			_kind === 'computed'
				? []
				: request.state.cells.filter((cell) =>
						_kind === 'props'
							? cell.graphNodeId === 'prop:props'
							: cell.graphNodeId === 'state:count',
					),
		);
		expect(classification.delta.state.computed).toEqual(
			_kind === 'computed' ? request.state.computed : [],
		);
		expect(classification.delta.view).toEqual({
			...view,
			locators: [],
			events: [],
			domUpdates: [],
			behaviors: [],
			elementHandles: [],
			asyncBoundaries: [],
		});
		expect(mergeResumeRecordDelta(baseline, classification.delta)).toEqual(request);
	});
});

test('merges payload records over matching derived keys, including computed snapshots', () => {
	const baseline = records({ cellValue: 0, computedValue: 'Count 0' });
	const payload = classifyResumeRecordDelta(
		baseline,
		records({ cellValue: 2, computedValue: 'Count 2' }),
	);
	expect(payload.kind).toBe('divergent');
	if (payload.kind !== 'divergent') return;

	const merged = mergeResumeRecordDelta(baseline, payload.delta);
	expect(merged.state.cells.find((cell) => cell.graphNodeId === 'state:count')?.value).toEqual(
		records({ cellValue: 2 }).state.cells[0]?.value,
	);
	expect(merged.state.computed[0]?.snapshot).toEqual(
		records({ computedValue: 'Count 2' }).state.computed[0]?.snapshot,
	);
});

test('rejects duplicate payload record keys while merging', () => {
	const baseline = records({});
	const duplicate = baseline.state.cells[0]!;
	expect(() =>
		mergeResumeRecordDelta(baseline, {
			...baseline,
			state: { ...baseline.state, cells: [duplicate, duplicate] },
		}),
	).toThrow(/MARKLESS_RESUME_RECORD_DELTA_DUPLICATE_KEY: payload record state:count/);
});

test('fails loudly when divergent resume records contain a non-serializable value', () => {
	const request = records({ propValue: { route: '/feed' } });
	const malformedRequest = {
		...request,
		view: { ...request.view, requestMetadata: { loader: () => 'feed' } },
	};

	expect(() => classifyResumeRecordDelta(records({}), malformedRequest as never)).toThrow(
		/MARKLESS_RESUME_RECORD_DIVERGENCE_UNSERIALIZABLE/,
	);
});

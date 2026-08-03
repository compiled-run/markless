import { describe, expect, test } from 'vitest';
import { createProtocolStatePayload } from '../src/protocol-state.ts';
import { classifyResumeRecordDelta } from '../src/resume-record-delta.ts';

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
	test('use the same value-diff rule and classify divergence', () => {
		expect(classifyResumeRecordDelta(records({}), records(requestChange))).toEqual({
			kind: 'divergent',
		});
	});
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

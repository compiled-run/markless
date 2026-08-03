import { expect, test } from 'vitest';
import { createProtocolStatePayload, renderPayloadScripts } from '@markless/serializer';
import { classifyResumeRecordDelta } from '@markless/serializer/resume-record-delta';
import { mergePrerenderPayloadRecords } from '../src/fns/prerender-resume.ts';

const view = {
	version: 1 as const,
	locators: [],
	events: [],
	domUpdates: [],
	behaviors: [],
	elementHandles: [],
	asyncBoundaries: [],
};

function records(count: number, label: string) {
	return {
		state: createProtocolStatePayload({
			cells: [
				{ graphNodeId: 'state:count', name: 'count', valueKind: 'scalar', value: count },
			],
			computed: [
				{
					graphNodeId: 'computed:label',
					name: 'label',
					async: true,
					snapshot: { status: 'fulfilled', version: 1, key: null, value: label },
				},
			],
		}),
		view,
	};
}

test('wake merges payload-carried cells and computed snapshots over derived records', () => {
	const derived = records(0, 'Count 0');
	const request = records(3, 'Count 3');
	const classification = classifyResumeRecordDelta(derived, request);
	expect(classification.kind).toBe('divergent');
	if (classification.kind !== 'divergent') return;

	const payload = renderPayloadScripts(classification.delta);
	const document = {
		querySelector(selector: string) {
			const script = selector.includes('markless/state')
				? payload.stateScript
				: selector.includes('markless/view')
					? payload.viewScript
					: undefined;
			return script ? { textContent: script.slice(script.indexOf('>') + 1, -9) } : null;
		},
	};

	expect(mergePrerenderPayloadRecords(derived, document)).toEqual(request);
});

test('wake keeps derived records when the container carries no delta payload', () => {
	const derived = records(0, 'Count 0');
	expect(mergePrerenderPayloadRecords(derived, { querySelector: () => null })).toBe(derived);
});

import { expect, test } from 'vitest';
import {
	deriveAllowedModules,
	forbiddenExecutedModules,
} from '../test-support/execution-expectations.ts';

test('full-tier row dispatch allows only the full dispatch spine and touched row capability', () => {
	const allowed = deriveAllowedModules({
		keyedRepeats: [{ parentHostNodeId: 'h0', rowEvents: [{ eventName: 'click' }] }],
		branches: [{ armRecords: [{ events: [{ eventName: 'click' }], domUpdates: [], behaviors: [], elementHandles: [] }] }],
		asyncBoundaries: [{}],
	}, { hostNodeId: 'h-row', eventName: 'click', recordKind: 'keyed-repeat-row' });

	expect([...allowed]).toEqual(expect.arrayContaining(['core/web/resume', 'web/resume-runtime', 'web/resume-events', 'web/resume-keyed-repeats']));
	expect(allowed).toContain('web/resume-branches');
	expect(allowed).not.toContain('web/resume-behaviors');
	expect(allowed).not.toContain('web/resume-sync-computed');
	expect(allowed).not.toContain('web/resume-handoff');
});

test('execution log chunk is classified as observability allowed after logged dispatch', () => {
	const allowed = deriveAllowedModules({
		events: [{ hostNodeId: 'h0', eventName: 'click' }],
	}, { hostNodeId: 'h0', eventName: 'click', executionLog: true });

	expect(allowed).toContain('virtual:markless:dev-log');
	expect(forbiddenExecutedModules(['virtual:markless:dev-log'], allowed)).toEqual([]);
});

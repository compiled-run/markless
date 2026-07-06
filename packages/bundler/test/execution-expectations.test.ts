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
	expect(allowed).toContain('web/dev-log');
	expect(allowed).toContain('web/execution-log-target');
	expect(forbiddenExecutedModules([
		'virtual:markless:dev-log',
		'web/dev-log',
		'web/execution-log-target',
	], allowed)).toEqual([]);
	expect(forbiddenExecutedModules(['web/execution-log-target'], deriveAllowedModules({
		events: [{ hostNodeId: 'h0', eventName: 'click' }],
	}, { hostNodeId: 'h0', eventName: 'click' }))).toEqual(['web/execution-log-target']);
});

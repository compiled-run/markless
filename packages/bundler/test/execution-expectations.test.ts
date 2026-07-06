import { expect, test } from 'vitest';
import { deriveAllowedModules } from '../test-support/execution-expectations.ts';

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

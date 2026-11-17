import { describe, expect, it } from 'vitest';
import { PROOF_REPORT_VERSION, proofVerdict, type ProofReport } from '../src/harness/report.ts';

const report = (platform: 'ios' | 'android', rungs: Array<[string, boolean]>): ProofReport => ({
	version: PROOF_REPORT_VERSION,
	platform,
	rungs: rungs.map(([name, passed]) => ({
		name,
		failure: passed
			? null
			: { step: 1, action: 'tap', role: 'flow', message: 'Assertion is false' },
		installSeconds: 1,
		flowSeconds: 10,
	})),
});

describe('proofVerdict', () => {
	it('passes only when both platforms passed the same rungs', () => {
		expect(
			proofVerdict([
				report('ios', [['03-counter', true]]),
				report('android', [['03-counter', true]]),
			]),
		).toEqual({ passed: true, problems: [] });
	});

	it('fails when a platform was not run, even if the other passed', () => {
		expect(proofVerdict([report('ios', [['03-counter', true]])]).problems).toEqual([
			'android was not run',
		]);
	});

	it('fails when one platform fails, naming it', () => {
		expect(
			proofVerdict([
				report('ios', [['03-counter', true]]),
				report('android', [['03-counter', false]]),
			]).problems,
		).toEqual(['03-counter failed on android']);
	});

	it('fails when the platforms ran different rungs', () => {
		const verdict = proofVerdict([
			report('ios', [['01-static-text', true]]),
			report('android', [
				['01-static-text', true],
				['03-counter', true],
			]),
		]);
		expect(verdict.passed).toBe(false);
		expect(verdict.problems[0]).toContain(
			'android ran 01-static-text, 03-counter but ios ran 01-static-text',
		);
	});
});

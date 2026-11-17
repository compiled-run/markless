import { parseAllDocuments } from 'yaml';
import { describe, expect, it } from 'vitest';
import { renderFlow, type LadderRung } from '../proofs/ladder.ts';
import { readProofExpected } from '../src/harness/expected.ts';
import { instrumentFlow } from '../src/harness/flow.ts';

const rung: LadderRung = readProofExpected(
	{
		rung: 3,
		name: 'counter',
		steps: [
			{ visible: ['Counter', 'Count 0'] },
			{ do: { tap: 'Count 0' }, visible: ['Count 1'], absent: ['Count 0'] },
			{ do: { relaunch: true }, visible: ['Count 0'] },
		],
	},
	'expected.json',
);
const flow = renderFlow('03-counter', rung);
const documents = (yaml: string) => parseAllDocuments(yaml).map((document) => document.toJS());

describe('instrumentFlow', () => {
	it('wraps each step of the rendered flow in a screenshot before and after it, at the step boundaries', () => {
		const instrumented = instrumentFlow(flow, rung, 'flow.yaml');
		expect(instrumented.steps.map((step) => [step.before, step.after])).toEqual([
			['00-launch-before', '00-launch-after'],
			['01-tap-before', '01-tap-after'],
			['02-relaunch-before', '02-relaunch-after'],
		]);
		const [config, commands] = documents(instrumented.yaml);
		expect(config).toEqual({ appId: '${APP_ID}', name: '03-counter' });
		expect(commands).toEqual([
			{ takeScreenshot: '00-launch-before' },
			{ launchApp: { clearState: true } },
			{ assertVisible: 'Counter' },
			{ assertVisible: 'Count 0' },
			{ takeScreenshot: '00-launch-after' },
			{ takeScreenshot: '01-tap-before' },
			{ tapOn: 'Count 0' },
			{ assertNotVisible: 'Count 0' },
			{ assertVisible: 'Count 1' },
			{ assertNotVisible: 'Count 0' },
			{ takeScreenshot: '01-tap-after' },
			{ takeScreenshot: '02-relaunch-before' },
			'stopApp',
			'launchApp',
			{ assertVisible: 'Count 0' },
			{ assertVisible: 'Count 0' },
			{ takeScreenshot: '02-relaunch-after' },
		]);
		expect(
			instrumented.commands.filter((command) => command.role === 'screenshot'),
		).toHaveLength(6);
		expect(instrumented.commands[12]).toEqual({ step: 2, role: 'flow' });
	});

	it('refuses a flow.yaml that drifted from its expected.json', () => {
		const drifted = flow.replace('- assertVisible: Count 1\n', '- assertVisible: Count 9\n');
		expect(drifted).not.toBe(flow);
		expect(() => instrumentFlow(drifted, rung, 'flow.yaml')).toThrow(
			'not what expected.json renders to',
		);
	});

	it('refuses a flow for another app id', () => {
		expect(() =>
			instrumentFlow(flow.replace('${APP_ID}', 'com.example.other'), rung, 'flow.yaml'),
		).toThrow('appId must be');
	});
});

describe('readProofExpected', () => {
	it('refuses a launch step with an action and a later step without one', () => {
		expect(() =>
			readProofExpected({ steps: [{ do: { tap: 'x' }, visible: [] }] }, 'e.json'),
		).toThrow('step 0 is the launch');
		expect(() =>
			readProofExpected({ steps: [{ visible: [] }, { visible: ['x'] }] }, 'e.json'),
		).toThrow('step 1 has no "do" action');
	});

	it('refuses steps without a visible text list', () => {
		expect(() => readProofExpected({ steps: [{ absent: ['x'] }] }, 'e.json')).toThrow(
			'no "visible" text list',
		);
		expect(() => readProofExpected({ steps: [] }, 'e.json')).toThrow('"steps" is empty');
	});
});

import { parseAllDocuments } from 'yaml';
import { describe, expect, it } from 'vitest';
import { readProofExpected } from '../src/harness/expected.ts';
import { instrumentFlow, literalSelector } from '../src/harness/flow.ts';

const flow = `appId: \${APP_ID}
name: counter
---
- launchApp:
    clearState: true
- assertVisible: Count 0
- tapOn: Count 0
- assertVisible: Count 1
`;

const expected = readProofExpected(
	{
		steps: [
			{ visible: ['Counter', 'Count 0'] },
			{
				do: { tap: 'Count 0' },
				visible: ['Count 1'],
				absent: ['Count 0'],
				disabled: ['Reset'],
			},
		],
	},
	'expected.json',
);

const commandsOf = (yaml: string) =>
	parseAllDocuments(yaml as string).map((document) => document.toJS())[1];

describe('instrumentFlow', () => {
	it('wraps each step in before and after screenshots and checks expected.json after the flow’s own checks', () => {
		const instrumented = instrumentFlow(flow, expected, 'flow.yaml');
		expect(instrumented.steps).toEqual([
			{ action: 'launchApp', before: '00-launchApp-before', after: '00-launchApp-after' },
			{ action: 'tapOn', before: '01-tapOn-before', after: '01-tapOn-after' },
		]);
		expect(commandsOf(instrumented.yaml)).toEqual([
			{ takeScreenshot: '00-launchApp-before' },
			{ launchApp: { clearState: true } },
			{ assertVisible: 'Count 0' },
			{ assertVisible: { text: 'Counter' } },
			{ assertVisible: { text: 'Count 0' } },
			{ takeScreenshot: '00-launchApp-after' },
			{ takeScreenshot: '01-tapOn-before' },
			{ tapOn: 'Count 0' },
			{ assertVisible: 'Count 1' },
			{ assertVisible: { text: 'Count 1' } },
			{ assertNotVisible: { text: 'Count 0' } },
			{ assertVisible: { text: 'Reset', enabled: false } },
			{ takeScreenshot: '01-tapOn-after' },
		]);
		expect(instrumented.commands.map((command) => `${command.step}:${command.role}`)).toEqual([
			'0:screenshot',
			'0:flow',
			'0:flow',
			'0:expected',
			'0:expected',
			'0:screenshot',
			'1:screenshot',
			'1:flow',
			'1:flow',
			'1:expected',
			'1:expected',
			'1:expected',
			'1:screenshot',
		]);
		expect(parseAllDocuments(instrumented.yaml).map((document) => document.toJS())[0]).toEqual({
			appId: '${APP_ID}',
			name: 'counter',
		});
	});

	it('refuses a flow whose actions do not line up one to one with expected.json steps', () => {
		const oneAction = flow.split('- tapOn')[0]!;
		expect(() => instrumentFlow(oneAction, expected, 'flow.yaml')).toThrow(
			'the flow has 1 actions but expected.json has 2 steps',
		);
	});

	it('refuses a flow for another app id', () => {
		expect(() =>
			instrumentFlow(flow.replace('${APP_ID}', 'com.example.other'), expected, 'flow.yaml'),
		).toThrow('appId must be');
	});

	it('refuses a flow that checks the screen before its first action', () => {
		expect(() =>
			instrumentFlow(
				flow.replace('- launchApp:\n    clearState: true\n', ''),
				expected,
				'flow.yaml',
			),
		).toThrow('before its first action');
	});

	it('matches expected texts literally, though Maestro reads selectors as regular expressions', () => {
		expect(literalSelector('Total (2) $5.00 [a|b]?')).toBe(
			'Total \\(2\\) \\$5\\.00 \\[a\\|b\\]\\?',
		);
		expect(
			new RegExp(`^${literalSelector('Total (2) $5.00 [a|b]?')}$`).test(
				'Total (2) $5.00 [a|b]?',
			),
		).toBe(true);
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

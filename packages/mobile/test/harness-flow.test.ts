import { parseAllDocuments } from 'yaml';
import { describe, expect, it } from 'vitest';
import { flowSteps, renderFlow, selector, type LadderRung } from '../proofs/ladder.ts';
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
	it('screenshots after every step and before every action, at the step boundaries of the rendered flow', () => {
		const instrumented = instrumentFlow(flow, rung, 'flow.yaml');
		expect(instrumented.steps.map((step) => [step.before, step.after])).toEqual([
			[null, '00-launch-after'],
			['01-tap-before', '01-tap-after'],
			['02-relaunch-before', '02-relaunch-after'],
		]);
		const [config, commands] = documents(instrumented.yaml);
		expect(config).toEqual({ appId: '${APP_ID}', name: '03-counter' });
		expect(commands).toEqual([
			{ runFlow: { when: { platform: 'Android' }, commands: ['clearState'] } },
			'launchApp',
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
		).toHaveLength(5);
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

describe('a text named by how it starts', () => {
	const prefixed = readProofExpected(
		{
			steps: [
				{ visible: ['All notes', { startsWith: 'Groceries' }] },
				{
					do: { tap: { startsWith: 'Groceries' } },
					visible: ['Edit'],
					absent: [{ startsWith: 'Groceries' }],
				},
			],
		},
		'e.json',
	);

	it('writes an anchored selector that runs on across the rest of the label', () => {
		expect(flowSteps(prefixed)).toEqual([
			[
				{ runFlow: { when: { platform: 'Android' }, commands: ['clearState'] } },
			'launchApp',
				{ assertVisible: 'All notes' },
				{ assertVisible: '^Groceries.*' },
			],
			[
				{ tapOn: '^Groceries.*' },
				// The change witness keys a text named by how it starts as it keys a plain one.
				{ assertNotVisible: '^Groceries.*' },
				{ assertVisible: 'Edit' },
				{ assertNotVisible: '^Groceries.*' },
			],
		]);
	});

	it('escapes what it starts with, and matches as Maestro does, across line breaks', () => {
		const pattern = selector({ startsWith: 'A (b). $5? [x]*' });
		expect(pattern).toBe('^A \\(b\\)\\. \\$5\\? \\[x\\]\\*.*');
		// Maestro's Regex.matches is a whole-label match with IGNORE_CASE and DOT_MATCHES_ALL.
		const maestro = new RegExp(`^(?:${pattern})$`, 'is');
		expect(maestro.test('A (b). $5? [x]*Personal\nNov 21')).toBe(true);
		expect(maestro.test('A (b). $5? [x]*')).toBe(true);
		expect(maestro.test('A (bc). $5? [x]*')).toBe(false);
		expect(maestro.test('xA (b). $5? [x]*')).toBe(false);
		expect(selector('Groceries')).toBe('Groceries');
	});

	it('refuses any other object in place of a text', () => {
		const launch = { visible: ['x'] };
		for (const bad of [
			{},
			{ startsWith: '' },
			{ startsWith: 1 },
			{ startsWith: 'a', endsWith: 'b' },
		]) {
			expect(() => readProofExpected({ steps: [{ visible: [bad] }] }, 'e.json')).toThrow(
				'no "visible" text list',
			);
			expect(() =>
				readProofExpected(
					{ steps: [launch, { do: { tap: 'x' }, visible: [], absent: [bad] }] },
					'e.json',
				),
			).toThrow('"absent" is not a text list');
			expect(() =>
				readProofExpected({ steps: [launch, { do: { tap: bad }, visible: [] }] }, 'e.json'),
			).toThrow('"tap" is neither a text');
		}
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

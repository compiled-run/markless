import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { parseAllDocuments } from 'yaml';
import {
	changeWitness,
	proofsDir,
	readRung,
	renderFlow,
	rungFolders,
	witnessCount,
} from '../proofs/ladder.ts';

test('the ladder has one proof folder per rung, in rung order', () => {
	expect(rungFolders().map((folder) => readRung(folder).rung)).toEqual([
		1,
		2,
		3,
		4,
		5,
		5.5,
		6,
		7,
		7.5,
		7.75,
		7.875,
		8,
		9,
		10,
		11,
		'D1',
		'D2',
		'D3',
		'D4',
		'P1',
		101,
		102,
		103,
		104,
	]);
	for (const folder of rungFolders())
		expect(existsSync(join(proofsDir, folder, 'App.tsrx'))).toBe(true);
});

test.each(rungFolders())('%s: flow.yaml is the flow its expected.json describes', (folder) => {
	const documents = (source: string) =>
		parseAllDocuments(source).map((document) => document.toJS());
	const committed = documents(readFileSync(join(proofsDir, folder, 'flow.yaml'), 'utf8'));
	expect(committed, 'run `node packages/mobile/proofs/write-flows.ts`').toEqual(
		documents(renderFlow(folder, readRung(folder))),
	);
	const [header, commands] = committed;
	expect(header).toEqual({ appId: '${APP_ID}', name: folder });
	// A rung that places the device sets its location first; the launch always clears the app's state.
	const launch = commands.findIndex(
		(command: unknown) =>
			typeof command === 'object' && command !== null && 'launchApp' in command,
	);
	expect(commands.slice(0, launch).every((command: object) => 'setLocation' in command)).toBe(
		true,
	);
	expect(commands[launch]).toMatchObject({ launchApp: { clearState: true } });
});

test.each(rungFolders())(
	'%s: every action step expects something the screen before it contradicts',
	(folder) => {
		const { steps } = readRung(folder);
		for (const [index, step] of steps.entries()) {
			// A resting height is not a text: the screenshot after a swipe is its record. Maestro's scrollUntilVisible fails by
			// itself unless the text comes on screen.
			if (
				index === 0 ||
				(step.do && ('relaunch' in step.do || 'swipe' in step.do || 'scrollTo' in step.do))
			)
				continue;
			expect(
				witnessCount(changeWitness(steps[index - 1]!, step)),
				`step ${index}`,
			).toBeGreaterThan(0);
		}
	},
);

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { parseAllDocuments } from 'yaml';
import {
	allRungFolders,
	changeWitness,
	looksOnly,
	navRungFolders,
	proofsDir,
	readRung,
	renderFlow,
	rungFolders,
	styleRungFolders,
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
		7.9375,
		8,
		9,
		10,
		11,
		12,
		13,
		14,
		15,
		16,
		17,
		18,
		'D1',
		'D2',
		'D3',
		'D4',
		'D4b',
		'D5',
		'D6',
		'D7',
		51,
		52,
		53,
		54,
		55,
		56,
		57,
		144,
		145,
		'J1',
		'J2',
		'J3',
		'J4',
		'J5',
		'J7',
		'J8',
		'J9',
		'J11',
		'J12',
		'J13',
		'J14',
		'J15',
		'P1',
		'R101',
		'R102',
		'R103',
		'R104',
		'R105',
		'R106',
		'R107',
		'R108',
		'R109',
		'R110',
		'R111',
		'R112',
		'R113',
		'R114',
		'R115',
		131,
		132,
		133,
		134,
		135,
		136,
		137,
		141,
		143,
		'T1',
		101,
		102,
		103,
		104,
		105,
		106,
		111,
		112,
		113,
		114,
		115,
		116,
		117,
		118,
		119,
		120,
		121,
		122,
		123,
		124,
		125,
		126,
		127,
		128,
		129,
		130,
		139,
		140,
		143,
		101,
		102,
		103,
		104,
	]);
	for (const folder of rungFolders())
		expect(existsSync(join(proofsDir, folder, 'App.tsrx'))).toBe(true);
});

test.each(allRungFolders())('%s: flow.yaml is the flow its expected.json describes', (folder) => {
	const documents = (source: string) =>
		parseAllDocuments(source).map((document) => document.toJS());
	const committed = documents(readFileSync(join(proofsDir, folder, 'flow.yaml'), 'utf8'));
	expect(committed, 'run `node packages/mobile/proofs/write-flows.ts`').toEqual(
		documents(renderFlow(folder, readRung(folder))),
	);
	const [header, commands] = committed;
	expect(header).toEqual({ appId: '${APP_ID}', name: folder });
	// Before the launch only the device's place and a cold Settings app are set; the launch always clears the app's state.
	const launch = commands.findIndex(
		(command: unknown) =>
			typeof command === 'object' && command !== null && 'launchApp' in command,
	);
	const coldSettings = {
		runFlow: { when: { platform: 'iOS' }, commands: [{ stopApp: 'com.apple.Preferences' }] },
	};
	expect(
		commands
			.slice(0, launch)
			.every(
				(command: object) =>
					'setLocation' in command ||
					JSON.stringify(command) === JSON.stringify(coldSettings),
			),
	).toBe(true);
	expect(commands[launch]).toMatchObject({ launchApp: { clearState: true } });
});

test('the navigation ladder has one app folder per rung, in rung order', () => {
	expect(navRungFolders().map((folder) => readRung(folder).rung)).toEqual([
		'J6',
		'J10',
		'N1',
		'N2',
		'N3',
		'N4',
		138,
		139,
		140,
		142,
	]);
	for (const folder of navRungFolders())
		expect(existsSync(join(proofsDir, folder, 'pages'))).toBe(true);
});

test('the styles ladder has one app folder per rung, in rung order', () => {
	expect(styleRungFolders().map((folder) => readRung(folder).rung)).toEqual([
		'S1',
		'S2',
		'S3',
		'S4',
		'S5',
		'S6',
		'S7',
		'S8',
		'S9',
		'S10',
		'S11',
		'S12',
		'S13',
		'S14',
		'S15',
	]);
	for (const folder of styleRungFolders())
		expect(existsSync(join(proofsDir, folder, 'pages'))).toBe(true);
});

test.each(allRungFolders())('%s: a rung that turns the phone leaves it upright', (folder) => {
	const turns = readRung(folder).steps.flatMap((step) =>
		step.do && 'orientation' in step.do ? [step.do.orientation] : [],
	);
	if (turns.length > 0) expect(turns.at(-1)).toBe('portrait');
});

test.each(allRungFolders())(
	'%s: every action step expects something the screen before it contradicts',
	(folder) => {
		const { steps } = readRung(folder);
		for (const [index, step] of steps.entries()) {
			// A resting height is not a text: the screenshot after a swipe is its record. Maestro's scrollUntilVisible fails by
			// itself unless the text comes on screen.
			if (
				index === 0 ||
				looksOnly(step.do) ||
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

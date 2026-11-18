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
		1, 2, 3, 4, 5, 5.5, 6, 7, 7.5, 7.75, 7.875, 8, 9, 10, 11,
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
	expect(commands[0]).toMatchObject({ launchApp: { clearState: true } });
});

test('the navigation ladder has one app folder per rung, in rung order', () => {
	expect(navRungFolders().map((folder) => readRung(folder).rung)).toEqual([
		'N1',
		'N2',
		'N3',
		'N4',
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
	]);
	for (const folder of styleRungFolders())
		expect(existsSync(join(proofsDir, folder, 'pages'))).toBe(true);
});

test.each(allRungFolders())(
	'%s: every action step expects something the screen before it contradicts',
	(folder) => {
		const { steps } = readRung(folder);
		for (const [index, step] of steps.entries()) {
			if (index === 0 || (step.do && 'relaunch' in step.do) || looksOnly(step.do)) continue;
			expect(
				witnessCount(changeWitness(steps[index - 1]!, step)),
				`step ${index}`,
			).toBeGreaterThan(0);
		}
	},
);

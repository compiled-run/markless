import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { describe, expect, it } from 'vitest';
import { APPS, appsDir } from '../apps/measure.ts';
import { renderFlow } from '../proofs/ladder.ts';
import { readProofExpected } from '../src/harness/expected.ts';
import { compileRungApp, readAppConfig } from '../src/harness/rung.ts';

const documents = (yaml: string) => parseAllDocuments(yaml).map((document) => document.toJS());

describe('the yardstick apps as phone rungs', () => {
	it.each(APPS)('%s: flow.yaml is the flow its expected.json describes', (app) => {
		const dir = join(appsDir, app);
		const expected = readProofExpected(
			JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')),
			join(dir, 'expected.json'),
		);
		expect(documents(readFileSync(join(dir, 'flow.yaml'), 'utf8'))).toEqual(
			documents(renderFlow(app, expected)),
		);
	});

	it("reads an app's own app.json, in its folder", () => {
		expect(readAppConfig(join(appsDir, 'checkin')).device?.usage).toMatchObject({
			camera: expect.any(String),
			location: expect.any(String),
		});
	});

	it('lowers @markless/ui families an app page imports, as the app build resolves them', async () => {
		const build = await compileRungApp(join(appsDir, 'checkin'), {
			target: 'ios',
			...readAppConfig(join(appsDir, 'checkin')),
		});
		const settings = build.diagnostics.filter(
			(diagnostic) =>
				diagnostic.page === 'pages/settings.tsrx' && diagnostic.severity === 'error',
		);
		expect(settings.map((diagnostic) => diagnostic.message)).toEqual([]);
	});
});

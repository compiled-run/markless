import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPS, appsDir } from '../apps/measure.ts';
import { readProofExpected } from '../src/harness/expected.ts';
import { proofsDir, readRung, renderFlow, allRungFolders } from './ladder.ts';

for (const folder of allRungFolders())
	writeFileSync(join(proofsDir, folder, 'flow.yaml'), renderFlow(folder, readRung(folder)));
for (const app of APPS) {
	const expected = join(appsDir, app, 'expected.json');
	writeFileSync(
		join(appsDir, app, 'flow.yaml'),
		renderFlow(app, readProofExpected(JSON.parse(readFileSync(expected, 'utf8')), expected)),
	);
}

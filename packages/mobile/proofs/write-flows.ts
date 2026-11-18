import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { proofsDir, readRung, renderFlow, allRungFolders } from './ladder.ts';

for (const folder of allRungFolders())
	writeFileSync(join(proofsDir, folder, 'flow.yaml'), renderFlow(folder, readRung(folder)));

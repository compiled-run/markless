import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { proofsDir, readRung, renderFlow, rungFolders } from './ladder.ts';

for (const folder of rungFolders())
	writeFileSync(join(proofsDir, folder, 'flow.yaml'), renderFlow(folder, readRung(folder)));

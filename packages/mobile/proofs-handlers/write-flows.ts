import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderFlow, type LadderRung } from '../proofs/ladder.ts';

for (const entry of readdirSync(import.meta.dirname, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const dir = join(import.meta.dirname, entry.name);
	const rung = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8')) as LadderRung;
	writeFileSync(join(dir, 'flow.yaml'), renderFlow(entry.name, rung));
}

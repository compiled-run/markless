import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
	appendInvariantResult,
	createVerdictReport,
	createWitnessVerdict,
	readVerdictReport,
	type WitnessBoxOutcome,
} from '../../analyzer/src/index.ts';

const reportUrl = new URL('../.witness/receipts/mla-verdicts.json', import.meta.url);
let pendingWrite = Promise.resolve();

export function appendWitnessVerdict(outcome: WitnessBoxOutcome): Promise<void> {
	const write = pendingWrite.then(() => writeWitnessVerdict(outcome));
	pendingWrite = write.catch(() => undefined);
	return write;
}

async function writeWitnessVerdict(outcome: WitnessBoxOutcome): Promise<void> {
	let report = createVerdictReport({ source: 'witness', lane: 'MLA-EXT-WITNESS' });
	try {
		report = readVerdictReport(JSON.parse(await readFile(reportUrl, 'utf8')));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
	}
	await mkdir(new URL('./', reportUrl), { recursive: true });
	await writeFile(
		reportUrl,
		`${JSON.stringify(appendInvariantResult(report, createWitnessVerdict(outcome)), null, '\t')}\n`,
	);
}

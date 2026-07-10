import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { BoxRunFn } from '@async/witness';
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

type WitnessBox = Omit<WitnessBoxOutcome, 'passed' | 'details'>;

export function runBoxWithVerdict(
	box: WitnessBox,
	fn: BoxRunFn,
	emit: (outcome: WitnessBoxOutcome) => Promise<void> = appendWitnessVerdict,
): BoxRunFn {
	return async (context) => {
		try {
			await fn(context);
			await emit({ ...box, passed: true });
		} catch (error) {
			await emit({
				...box,
				passed: false,
				details: [error instanceof Error ? error.message : String(error)],
			});
			throw error;
		}
	};
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

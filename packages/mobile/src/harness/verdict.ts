#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { proofVerdict, type ProofReport } from './report.ts';

/** Reads one report per platform and passes only when both platforms passed every rung; needs no installed packages. */
export function verdictCommand(files: ReadonlyArray<string>): number {
	const reports = files.map((file) => JSON.parse(readFileSync(file, 'utf8')) as ProofReport);
	const { passed, problems } = proofVerdict(reports);
	for (const problem of problems) console.log(`FAIL ${problem}`);
	console.log(passed ? 'proof passed on iOS and Android' : 'proof failed');
	return passed ? 0 : 1;
}

if (import.meta.main) process.exitCode = verdictCommand(process.argv.slice(2));

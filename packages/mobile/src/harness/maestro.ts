import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { exec } from './exec.ts';
import type { InstrumentedFlow } from './flow.ts';
import { PROOF_APP_ID, PROOF_APP_ID_VARIABLE, type ProofPlatform } from './proof-app.ts';

export type FlowFailure = {
	readonly step: number;
	readonly action: string;
	/** `flow`: one of the rung's own commands (its action or an expected.json check) failed. */
	readonly role: 'flow' | 'screenshot' | 'unknown';
	/** The Maestro command that failed, as Maestro records it (`assertConditionCommand`, `tapOnElement`...). */
	readonly command?: string;
	readonly message: string;
};

export type FlowResult = { readonly failure: FlowFailure | null; readonly seconds: number };

type CommandRecord = {
	readonly command: Record<string, unknown>;
	readonly metadata: {
		readonly status: string;
		readonly depth?: number;
		readonly error?: { readonly message?: string };
	};
};

/** Commands Maestro records before the flow's own: variable definitions and the config header. */
const SETUP_COMMANDS = new Set(['defineVariablesCommand', 'applyConfigurationCommand']);

/**
 * Runs an instrumented flow on one device, copies its before/after screenshots to `screenshotDir`, and names the first
 * failing step from Maestro's own command record (commands.json), not from its console text.
 */
export async function runFlow(input: {
	readonly platform: ProofPlatform;
	readonly device: string;
	readonly flow: InstrumentedFlow;
	readonly flowName: string;
	readonly workDir: string;
	readonly screenshotDir: string;
}): Promise<FlowResult> {
	const started = performance.now();
	const outDir = join(input.workDir, 'maestro');
	rmSync(input.workDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	const flowFile = join(input.workDir, `${input.flowName}.yaml`);
	writeFileSync(flowFile, input.flow.yaml);
	const run = await exec(
		'maestro',
		[
			'--device',
			input.device,
			'test',
			'-e',
			`${PROOF_APP_ID_VARIABLE}=${PROOF_APP_ID}`,
			'--test-output-dir',
			outDir,
			flowFile,
		],
		{ allowFailure: true, timeoutMs: 600_000 },
	);
	const runs = existsSync(outDir) ? readdirSync(outDir) : [];
	const flowOut = runs.length === 1 ? join(outDir, runs[0]!, input.flowName) : null;

	rmSync(input.screenshotDir, { recursive: true, force: true });
	mkdirSync(input.screenshotDir, { recursive: true });
	const shots = flowOut ? join(flowOut, 'takeScreenshot') : null;
	if (shots && existsSync(shots)) {
		for (const shot of readdirSync(shots))
			copyFileSync(join(shots, shot), join(input.screenshotDir, shot));
	}

	let failure: FlowFailure | null = null;
	const recordFile = flowOut ? join(flowOut, 'commands.json') : null;
	if (recordFile && existsSync(recordFile)) {
		const records = (JSON.parse(readFileSync(recordFile, 'utf8')) as CommandRecord[]).filter(
			(record) =>
				(record.metadata.depth ?? 0) === 0 &&
				!SETUP_COMMANDS.has(Object.keys(record.command)[0]!),
		);
		const failedAt = records.findIndex((record) => record.metadata.status === 'FAILED');
		if (failedAt >= 0) {
			const role = input.flow.commands[failedAt];
			const step = role?.step ?? -1;
			failure = {
				step,
				action: input.flow.steps[step]?.action ?? 'unknown',
				role: role?.role ?? 'unknown',
				command: Object.keys(records[failedAt]!.command)[0],
				message: records[failedAt]!.metadata.error?.message ?? 'no message recorded',
			};
			const failureShots = join(flowOut!, 'screenshots');
			if (existsSync(failureShots)) {
				for (const shot of readdirSync(failureShots)) {
					copyFileSync(
						join(failureShots, shot),
						join(input.screenshotDir, `${String(step).padStart(2, '0')}-failure.png`),
					);
				}
			}
		}
	}
	if (!failure && run.code !== 0) {
		failure = {
			step: -1,
			action: 'unknown',
			role: 'unknown',
			message: `maestro exited ${run.code}\n${run.stdout}${run.stderr}`.trim(),
		};
	}
	return { failure, seconds: (performance.now() - started) / 1000 };
}

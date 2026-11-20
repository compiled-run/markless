#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, openSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { allRungFolders } from '../../proofs/ladder.ts';
import { PROOF_PLATFORMS, type ProofPlatform } from '../harness/proof-app.ts';
import type { ProofReport } from '../harness/report.ts';
import { affectedRungs, changedPaths, defaultBase } from './affected.ts';
import { rungDir, writeBundle } from './bundle.ts';
import { DEFAULT_POOL, parsePhone, phoneId, type PhoneSpec } from './pool.ts';
import {
	chunkFile,
	type Chunk,
	daemonLog,
	jobDir,
	jobsDir,
	type JobSpec,
	phonesFile,
	readJson,
	resultDir,
	runnerHome,
	runningDaemon,
	rungsOn,
	screenshotsDir,
	type Summary,
	writeJson,
} from './store.ts';

const USAGE = `usage: phones <command>

  start [--ios <simulator>]... [--android <avd>@<port>]...
                         start the machine's runner and boot its phones (default: ios markless-runner, android markless_runner@5570)
  stop [--phones]        stop the runner (and shut its phones down)
  status                 the phones and every job that has not finished
  submit [--platform ios|android] [--chunk <n>] [--wait] (--all | --affected [--base <rev>] | --failed <job> | <rung>...)
                         compile the rungs in this checkout, queue them, print the job id; --failed reruns each rung that
                         failed in <job> only on the phone it failed on (not a proof by itself)
  wait <job>             wait for a job; exits 0 only if it passed
  result <job> [--copy-screenshots]
                         print a finished job's results; copy its screenshots into this checkout's rung folders
  affected [--base <rev> | --files <repo path>...]
                         the rungs a change since <rev> (default origin/cw/native-integration) can affect, and why

Runner files: ${runnerHome()} (MARKLESS_PHONES_HOME). Ladder rungs refused by name never run: ${'y4-sheet-beside-drawer'}.`;

/** Rungs the ladder lists that no phone build exists for yet (named in the conformance report). */
const REFUSED = new Set(['y4-sheet-beside-drawer']);
const ladder = () => allRungFolders().filter((name) => !REFUSED.has(name));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function start(pool: ReadonlyArray<PhoneSpec>): void {
	const running = runningDaemon();
	if (running) {
		console.log(
			`the runner already runs (pid ${running.pid}, phones ${running.pool.map(phoneId).join(', ')})`,
		);
		return;
	}
	mkdirSync(runnerHome(), { recursive: true });
	const out = openSync(daemonLog(), 'a');
	const child = spawn(
		process.execPath,
		[join(import.meta.dirname, 'daemon.ts'), JSON.stringify(pool)],
		{
			detached: true,
			stdio: ['ignore', out, out],
		},
	);
	child.unref();
	console.log(
		`runner started (pid ${child.pid}) with ${pool.map(phoneId).join(', ')}; log ${daemonLog()}`,
	);
}

async function stop(phones: boolean): Promise<void> {
	const running = runningDaemon();
	if (!running) console.log('no runner runs');
	else {
		process.kill(running.pid, 'SIGTERM');
		while (runningDaemon()) await sleep(250);
		console.log(`runner ${running.pid} stopped`);
	}
	if (phones) {
		const { stopPhone } = await import('./phones.ts');
		const { androidTools } = await import('../harness/tools.ts');
		const pool = running?.pool ?? DEFAULT_POOL;
		const tools = pool.some((spec) => spec.platform === 'android')
			? await androidTools()
			: undefined;
		for (const spec of pool) {
			await stopPhone(spec, tools);
			console.log(`stopped ${phoneId(spec)}`);
		}
	}
}

const chunksOf = (job: string): Chunk[] =>
	existsSync(join(job, 'chunks'))
		? readdirSync(join(job, 'chunks'))
				.filter((file) => file.endsWith('.json') && !file.endsWith('.result.json'))
				.map((file) => readJson<Chunk>(join(job, 'chunks', file))!)
		: [];

function status(): void {
	const running = runningDaemon();
	console.log(
		running ? `runner pid ${running.pid}, code from ${running.code}` : 'no runner runs',
	);
	for (const phone of readJson<
		Array<{ id: string; state: string; reason?: string; chunk?: string }>
	>(phonesFile()) ?? [])
		console.log(
			`  ${phone.id}: ${phone.state}${phone.chunk ? ` ${phone.chunk}` : ''}${phone.reason ? ` (${phone.reason})` : ''}`,
		);
	const open = existsSync(jobsDir())
		? readdirSync(jobsDir()).filter(
				(id) => !existsSync(join(resultDir(jobDir(id)), 'summary.json')),
			)
		: [];
	for (const id of open.sort()) {
		const spec = readJson<JobSpec>(join(jobDir(id), 'job.json'));
		if (!spec) continue;
		const chunks = chunksOf(jobDir(id));
		const count = (state: Chunk['state']) =>
			chunks.filter((chunk) => chunk.state === state).length;
		console.log(
			`job ${id} from ${spec.worktree} (${spec.rungs.length} rungs on ${spec.platforms.join(', ')}): ${count('done')} chunks done, ${count('running')} running, ${count('queued')} queued`,
		);
	}
}

async function submit(argv: string[]): Promise<number> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			platform: { type: 'string' },
			chunk: { type: 'string', default: '8' },
			all: { type: 'boolean', default: false },
			affected: { type: 'boolean', default: false },
			base: { type: 'string' },
			host: { type: 'string', default: 'adapters' },
			wait: { type: 'boolean', default: false },
			failed: { type: 'string' },
		},
	});
	const platforms: ProofPlatform[] = values.platform
		? PROOF_PLATFORMS.filter((platform) => platform === values.platform)
		: [...PROOF_PLATFORMS];
	if (platforms.length === 0)
		throw new Error(`--platform is ios or android, not ${values.platform}`);
	if (values.host !== 'adapters' && values.host !== 'stub')
		throw new Error(`--host is adapters or stub, not ${values.host}`);
	let names: string[];
	let onlyOn: JobSpec['onlyOn'];
	if (values.failed) {
		const failed = failedRungs(values.failed);
		if (failed.rungs.length === 0) {
			console.log(`job ${values.failed} has no failed rung`);
			return 0;
		}
		names = failed.rungs;
		platforms.splice(
			0,
			platforms.length,
			...platforms.filter((platform) => (failed.byPlatform[platform] ?? []).length > 0),
		);
		onlyOn = Object.fromEntries(
			platforms.map((platform) => [platform, failed.byPlatform[platform]!]),
		);
		for (const platform of platforms)
			console.log(
				`rerunning on ${platform} the rungs that failed there in ${values.failed}: ${failed.byPlatform[platform]!.join(' ')}`,
			);
	} else if (values.all) names = ladder();
	else if (values.affected) {
		const selection = await affectedRungs(changedPaths(values.base ?? defaultBase()), ladder());
		console.log(
			selection.all
				? `every rung: ${selection.all}`
				: selection.rungs.map((r) => `${r.name}: ${r.because}`).join('\n') ||
						'no rung is affected',
		);
		names = selection.rungs.map((rung) => rung.name);
		if (names.length === 0) return 0;
	} else names = positionals;
	if (names.length === 0) {
		console.log(USAGE);
		return 2;
	}
	const id = `${new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..*/, '')}-${process.pid}`;
	const job = jobDir(id);
	mkdirSync(job, { recursive: true });
	let spec: JobSpec;
	try {
		spec = await writeBundle({
			job,
			id,
			rungDirs: names.map(rungDir),
			platforms,
			host: values.host,
			log: (line) => console.log(`  ${line}`),
		});
	} catch (error) {
		rmSync(job, { recursive: true, force: true });
		throw error;
	}
	if (onlyOn) spec = { ...spec, onlyOn };
	const size = Math.max(1, Number(values.chunk));
	for (const platform of platforms) {
		const rungs = rungsOn(spec, platform);
		for (let at = 0; at * size < rungs.length; at++)
			writeJson(chunkFile(job, `${platform}-${String(at).padStart(3, '0')}`), {
				state: 'queued',
				platform,
				rungs: rungs.slice(at * size, (at + 1) * size),
				attempt: 0,
			} satisfies Chunk);
	}
	// The spec goes last: the runner takes a job only once its bundle and chunks are complete.
	writeJson(join(job, 'job.json'), spec);
	if (!runningDaemon()) start(DEFAULT_POOL);
	console.log(
		`job ${id}: ${spec.rungs.length} rungs on ${platforms.join(', ')} from ${spec.head.slice(0, 9)}${spec.dirty ? ' with uncommitted changes' : ''}`,
	);
	return values.wait ? wait(id) : 0;
}

/** The rungs that failed in a finished job: all of them in the job's order, and those that failed on each platform. */
function failedRungs(id: string): {
	rungs: string[];
	byPlatform: Partial<Record<ProofPlatform, string[]>>;
} {
	const job = jobDir(id);
	const spec = readJson<JobSpec>(join(job, 'job.json'));
	if (!spec) throw new Error(`no job ${id}`);
	if (!existsSync(join(resultDir(job), 'summary.json')))
		throw new Error(`job ${id} has not finished`);
	const byPlatform: Partial<Record<ProofPlatform, string[]>> = {};
	for (const platform of spec.platforms) {
		const report = readJson<ProofReport>(join(resultDir(job), `${platform}.json`))!;
		const failed = report.rungs.filter((rung) => rung.failure).map((rung) => rung.name);
		if (failed.length > 0) byPlatform[platform] = failed;
	}
	const all = new Set(Object.values(byPlatform).flat());
	return { rungs: spec.rungs.filter((name) => all.has(name)), byPlatform };
}

function printResult(id: string): Summary | undefined {
	const job = jobDir(id);
	const summary = readJson<Summary>(join(resultDir(job), 'summary.json'));
	if (!summary) return undefined;
	const spec = readJson<JobSpec>(join(job, 'job.json'))!;
	for (const platform of spec.platforms) {
		const report = readJson<ProofReport>(join(resultDir(job), `${platform}.json`))!;
		for (const rung of report.rungs) {
			const timing = `install ${rung.installSeconds.toFixed(1)} s, flow ${rung.flowSeconds.toFixed(1)} s`;
			if (!rung.failure) console.log(`PASS ${rung.name} ${platform} (${timing})`);
			else
				console.log(
					`FAIL ${rung.name} ${platform} at step ${rung.failure.step} (${rung.failure.action}) (${timing})\n  ${rung.failure.message.split('\n').slice(0, 12).join('\n  ')}`,
				);
		}
	}
	for (const rung of summary.rerun) console.log(`ran again because its phone was unreachable: ${rung}`);
	for (const problem of summary.problems) console.log(`FAIL ${problem}`);
	console.log(
		`job ${id} ${summary.passed ? 'passed' : 'failed'} in ${summary.seconds.toFixed(0)} s; reports in ${resultDir(job)}, screenshots in ${join(job, 'screenshots')}`,
	);
	return summary;
}

async function wait(id: string): Promise<number> {
	const job = jobDir(id);
	if (!existsSync(join(job, 'job.json'))) throw new Error(`no job ${id}`);
	let last = '';
	for (;;) {
		const summary = printResultIfDone(id);
		if (summary) return summary.passed ? 0 : 1;
		const chunks = chunksOf(job);
		const line = `${chunks.filter((c) => c.state === 'done').length} of ${chunks.length} chunks done`;
		if (line !== last) console.log(line);
		last = line;
		if (!runningDaemon())
			console.log(`no runner runs: start one with \`phones start\` (log ${daemonLog()})`);
		await sleep(runningDaemon() ? 3000 : 30_000);
	}
}

const printResultIfDone = (id: string) =>
	existsSync(join(resultDir(jobDir(id)), 'summary.json')) ? printResult(id) : undefined;

function copyScreenshots(id: string): void {
	const job = jobDir(id);
	const spec = readJson<JobSpec>(join(job, 'job.json'))!;
	for (const rung of spec.rungs)
		for (const platform of spec.platforms) {
			const from = screenshotsDir(job, rung, platform);
			if (!existsSync(from)) continue;
			const to = join(rungDir(rung), 'screenshots', platform);
			rmSync(to, { recursive: true, force: true });
			cpSync(from, to, { recursive: true });
		}
	console.log(
		`copied the screenshots of ${spec.rungs.length} rungs into this checkout's rung folders`,
	);
}

async function main(argv: string[]): Promise<number> {
	const [command, ...rest] = argv;
	switch (command) {
		case 'start': {
			const { values } = parseArgs({
				args: rest,
				options: {
					ios: { type: 'string', multiple: true },
					android: { type: 'string', multiple: true },
				},
			});
			const pool = [
				...(values.ios ?? []).map((name) => parsePhone('ios', name)),
				...(values.android ?? []).map((name) => parsePhone('android', name)),
			];
			start(pool.length > 0 ? pool : DEFAULT_POOL);
			return 0;
		}
		case 'stop':
			await stop(rest.includes('--phones'));
			return 0;
		case 'status':
			status();
			return 0;
		case 'submit':
			return submit(rest);
		case 'wait':
			return wait(rest[0] ?? '');
		case 'result': {
			const summary = printResult(rest[0] ?? '');
			if (!summary) {
				console.log(`job ${rest[0]} has not finished`);
				return 2;
			}
			if (rest.includes('--copy-screenshots')) copyScreenshots(rest[0]!);
			return summary.passed ? 0 : 1;
		}
		case 'affected': {
			const { values, positionals } = parseArgs({
				args: rest,
				allowPositionals: true,
				options: { base: { type: 'string' }, files: { type: 'boolean', default: false } },
			});
			const base = values.files ? 'the named files' : (values.base ?? defaultBase());
			const changed = values.files ? positionals : changedPaths(base);
			const selection = await affectedRungs(changed, ladder());
			console.log(`${changed.length} changed file(s) since ${base}`);
			if (selection.all)
				console.log(`every rung (${selection.rungs.length}): ${selection.all}`);
			else for (const rung of selection.rungs) console.log(`${rung.name}: ${rung.because}`);
			if (!selection.all && selection.rungs.length === 0) console.log('no rung is affected');
			return 0;
		}
		default:
			console.log(USAGE);
			return command === undefined || command === 'help' || command === '--help' ? 0 : 2;
	}
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(error: unknown) => {
		console.error(`phones: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	},
);

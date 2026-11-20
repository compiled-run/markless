#!/usr/bin/env node
// The machine's one phone runner: owns a fixed pool of phones, hands queued chunks to free phones of their platform, and
// restarts a phone that stops answering. Every job's files live under its own folder, so checkouts never share one.
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ECHO_SERVER_PORT } from '../../proofs/ladder.ts';
import { startEchoServer } from '../harness/echo-server.ts';
import { PROOF_REPORT_VERSION, proofVerdict, type ProofReport } from '../harness/report.ts';
import { androidTools, type AndroidTools } from '../harness/tools.ts';
import {
	bootPhone,
	heavyCommand,
	phoneAnswers,
	phoneRunning,
	stopPhone,
	withAdmission,
} from './phones.ts';
import { parsePhone, phoneId, type PhoneSpec, type PhoneState, transitionPhone } from './pool.ts';
import type { BundledRung } from './bundle.ts';
import {
	bundleRung,
	chunkFile,
	chunkLog,
	chunkResultFile,
	type Chunk,
	daemonFile,
	daemonLog,
	type DaemonRecord,
	jobDir,
	jobsDir,
	type JobSpec,
	phonesFile,
	readJson,
	rerunAfterPhoneLoss,
	resultDir,
	type RungResult,
	runningDaemon,
	rungsOn,
	type Summary,
	transitionChunk,
	writeJson,
} from './store.ts';

/** Machine-queue reservations: a chunk with host tests peaked at 0.9 GB (heavy-history, 2026-11-18); a boot holds a phone's memory. */
const CHUNK_GB = 2;
/** 1.2 busy cores for a chunk without host tests, 3.6 with xcodebuild's (cpuS over wall time, 2026-11-18). */
const CHUNK_CORES = 2;
const BOOT_GB = { ios: 3, android: 4 } as const;
const BOOT_ATTEMPTS = 3;
const HEALTH_EVERY_MS = 30_000;

type Phone = {
	readonly spec: PhoneSpec;
	state: PhoneState;
	checkedAt: number;
};

const log = (line: string) => appendFileSync(daemonLog(), `${new Date().toISOString()} ${line}\n`);
const pool = JSON.parse(process.argv[2] ?? '[]') as PhoneSpec[];
if (pool.length === 0) throw new Error('usage: daemon.ts <pool json>');
for (const spec of pool)
	if (spec.platform === 'android') parsePhone('android', `${spec.avd}@${spec.port}`);
const other = runningDaemon();
if (other) {
	console.error(`a runner already runs (pid ${other.pid}); stop it first`);
	process.exit(1);
}
writeJson(daemonFile(), {
	pid: process.pid,
	startedAt: Date.now(),
	code: import.meta.dirname,
	pool,
} satisfies DaemonRecord);
log(
	`runner ${process.pid} starts with ${pool.map(phoneId).join(', ')}; machine queue: ${heavyCommand() ?? 'none'}`,
);

// A chunk with a rung that fetches holds the test's echo server, open only while such a chunk runs, so a web test or the
// harness can take the port between jobs; a server already there answers alike.
let echo:
	| { users: number; server: Promise<{ close: () => Promise<void> } | undefined> }
	| undefined;
const holdEcho = () => {
	echo ??= {
		users: 0,
		server: startEchoServer().then(
			(server) => (log(`echo server on 127.0.0.1:${ECHO_SERVER_PORT}`), server),
			(error: unknown) => {
				log(
					`echo server not started: ${error instanceof Error ? error.message : String(error)}`,
				);
				return undefined;
			},
		),
	};
	echo.users++;
	return echo.server;
};
const releaseEcho = async () => {
	if (!echo || --echo.users > 0) return;
	const { server } = echo;
	echo = undefined;
	await (await server)?.close();
};
const fetches = (job: string, chunk: Chunk) =>
	chunk.rungs.some(
		(rung) =>
			readJson<BundledRung>(join(bundleRung(job, rung), 'rung.json'))?.server === 'echo',
	);

const tools: AndroidTools | undefined = pool.some((spec) => spec.platform === 'android')
	? await androidTools()
	: undefined;
const phones: Phone[] = pool.map((spec) => ({
	spec,
	state: { state: 'booting', since: Date.now() },
	checkedAt: 0,
}));
const children = new Set<ReturnType<typeof spawn>>();
let stopping = false;

const publish = () =>
	writeJson(
		phonesFile(),
		phones.map((phone) => ({ id: phoneId(phone.spec), ...phone.state })),
	);
const move = (phone: Phone, event: Parameters<typeof transitionPhone>[1]) => {
	phone.state = transitionPhone(phone.state, event);
	publish();
};

async function boot(phone: Phone, restart: boolean): Promise<void> {
	const id = phoneId(phone.spec);
	for (let attempt = 1; attempt <= BOOT_ATTEMPTS; attempt++) {
		try {
			const fresh = restart || attempt > 1;
			// A phone that already runs costs the machine nothing new, so only a real boot waits for the machine queue.
			const address =
				!fresh && (await phoneRunning(phone.spec, tools))
					? await bootPhone(phone.spec, tools)
					: await withAdmission(BOOT_GB[phone.spec.platform], `boot ${id}`, async () => {
							if (fresh) await stopPhone(phone.spec, tools);
							return bootPhone(phone.spec, tools);
						});
			phone.checkedAt = Date.now();
			move(phone, { type: 'booted', device: address.device });
			log(`${id} ready (${address.device})`);
			return;
		} catch (error) {
			log(
				`${id} boot ${attempt} of ${BOOT_ATTEMPTS} failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	move(phone, { type: 'give-up', reason: `${BOOT_ATTEMPTS} boots failed; see ${daemonLog()}` });
}

async function restart(phone: Phone, reason: string): Promise<void> {
	log(`${phoneId(phone.spec)} stopped answering (${reason}); restarting it`);
	move(phone, { type: 'lost', reason });
	await boot(phone, true);
}

const jobIds = () =>
	existsSync(jobsDir())
		? readdirSync(jobsDir())
				.filter(
					(id) =>
						existsSync(join(jobDir(id), 'job.json')) &&
						!existsSync(join(resultDir(jobDir(id)), 'summary.json')),
				)
				.sort()
		: [];
const chunkNames = (job: string) =>
	existsSync(join(job, 'chunks'))
		? readdirSync(join(job, 'chunks'))
				.filter((file) => file.endsWith('.json') && !file.endsWith('.result.json'))
				.map((file) => file.slice(0, -'.json'.length))
				.sort()
		: [];

/** The oldest job's next queued chunk for this platform. */
function nextChunk(
	platform: PhoneSpec['platform'],
): { job: string; name: string; chunk: Chunk } | undefined {
	for (const id of jobIds()) {
		const job = jobDir(id);
		for (const name of chunkNames(job)) {
			const chunk = readJson<Chunk>(chunkFile(job, name))!;
			if (chunk.state === 'queued' && chunk.platform === platform)
				return { job, name, chunk };
		}
	}
	return undefined;
}

async function run(phone: Phone, job: string, name: string, queued: Chunk): Promise<void> {
	if (phone.state.state !== 'ready') return;
	const { device, driverInstalled } = phone.state;
	const id = phoneId(phone.spec);
	writeJson(
		chunkFile(job, name),
		transitionChunk(queued, { type: 'claim', phone: id, at: Date.now() }),
	);
	move(phone, { type: 'take', chunk: `${job}/${name}` });
	const echoed = fetches(job, queued);
	if (echoed) await holdEcho();
	try {
		log(`${id} runs ${job} ${name} (${queued.rungs.length} rungs)`);
		mkdirSync(join(job, 'logs'), { recursive: true });
		const out = openSync(chunkLog(job, name), 'a');
		const command = [
			process.execPath,
			join(import.meta.dirname, 'run-chunk.ts'),
			job,
			name,
			device,
			driverInstalled ? 'keep-driver' : 'reinstall-driver',
		];
		const heavy = heavyCommand();
		const child = spawn(heavy ?? command[0]!, heavy ? command : command.slice(1), {
			// Never give up: a chunk that the queue refuses to admit would end without a result.
			env: {
				...process.env,
				HEAVY_GB: String(CHUNK_GB),
				HEAVY_CORES: String(CHUNK_CORES),
				HEAVY_MAX_WAIT: '0',
			},
			stdio: ['ignore', out, out],
		});
		children.add(child);
		await new Promise<void>((resolve) => child.on('exit', () => resolve()));
		children.delete(child);
		if (stopping) return;
		const running = readJson<Chunk>(chunkFile(job, name))!;
		const written = readJson<RungResult[]>(chunkResultFile(job, name)) ?? [];
		const results = running.rungs.map(
			(rung) =>
				written.find((result) => result.name === rung) ?? {
					name: rung,
					failure: {
						step: -1,
						action: 'runner',
						role: 'unknown' as const,
						message: `the chunk ended without a result; see ${chunkLog(job, name)}`,
					},
					installSeconds: 0,
					flowSeconds: 0,
				},
		);
		const answers = await phoneAnswers(phone.spec, { device }, tools);
		const done = transitionChunk(running, {
			type: 'finish',
			results,
			phoneLost: !answers,
			at: Date.now(),
		});
		writeJson(chunkFile(job, name), done);
		const again = rerunAfterPhoneLoss(done);
		if (again.length > 0)
			writeJson(chunkFile(job, `${name}-rerun`), {
				state: 'queued',
				platform: done.platform,
				rungs: again,
				attempt: 1,
			} satisfies Chunk);
		log(
			`${id} finished ${job} ${name}: ${results.filter((r) => !r.failure).length} of ${results.length} passed${answers ? '' : '; the phone stopped answering'}${again.length > 0 ? `; ${again.length} rung(s) that did not reach the phone run again` : ''}`,
		);
		if (answers) move(phone, { type: 'release' });
		else await restart(phone, `during ${name}`);
	} catch (error) {
		const message = `the runner failed this chunk: ${error instanceof Error ? error.message : String(error)}`;
		log(`${id}: ${message}`);
		const current = readJson<Chunk>(chunkFile(job, name))!;
		if (current.state === 'running')
			writeJson(
				chunkFile(job, name),
				transitionChunk(current, {
					type: 'finish',
					results: current.rungs.map((rung) => ({
						name: rung,
						failure: { step: -1, action: 'runner', role: 'unknown', message },
						installSeconds: 0,
						flowSeconds: 0,
					})),
					phoneLost: false,
					at: Date.now(),
				}),
			);
		// Read again: the awaits above may have moved the phone.
		if ((phone.state as PhoneState).state === 'busy') move(phone, { type: 'release' });
	} finally {
		if (echoed) await releaseEcho();
	}
	finishJobs();
}

/** Writes a job's reports, in the order it named its rungs, once no chunk of it is queued or running. */
function finishJobs(): void {
	for (const id of jobIds()) {
		const job = jobDir(id);
		const spec = readJson<JobSpec>(join(job, 'job.json'))!;
		const chunks = chunkNames(job).map((name) => readJson<Chunk>(chunkFile(job, name))!);
		if (chunks.length === 0 || chunks.some((chunk) => chunk.state !== 'done')) continue;
		const rerun = new Set<string>();
		const reports: ProofReport[] = spec.platforms.map((platform) => {
			const latest = new Map<string, RungResult>();
			for (const chunk of chunks
				.filter((c) => c.platform === platform)
				.sort((a, b) => a.attempt - b.attempt)) {
				if (chunk.state !== 'done') continue;
				for (const result of chunk.results) {
					if (chunk.attempt > 0) rerun.add(`${result.name} on ${platform}`);
					latest.set(result.name, result);
				}
			}
			return {
				version: PROOF_REPORT_VERSION,
				platform,
				rungs: rungsOn(spec, platform).map((name) => latest.get(name)!),
			};
		});
		for (const report of reports)
			writeJson(join(resultDir(job), `${report.platform}.json`), report);
		const verdict = proofVerdict(reports);
		const own = reports.every((report) => report.rungs.every((rung) => !rung.failure));
		// Only a job that ran every rung on both platforms is a proof; any other passes on its own reports.
		const proof = spec.platforms.length === 2 && !spec.onlyOn;
		const summary: Summary = {
			passed: proof ? verdict.passed : own,
			problems: proof
				? verdict.problems
				: reports.flatMap((r) =>
						r.rungs
							.filter((g) => g.failure)
							.map((g) => `${g.name} failed on ${r.platform}`),
					),
			seconds: (Date.now() - spec.createdAt) / 1000,
			rerun: [...rerun],
		};
		writeJson(join(resultDir(job), 'summary.json'), summary);
		log(`job ${id} ${summary.passed ? 'passed' : 'failed'} in ${summary.seconds.toFixed(0)} s`);
	}
}

/** Takes the next chunk only once the phone answers: a job never starts on a phone that died while idle. */
async function takeNext(phone: Phone): Promise<void> {
	if (phone.state.state !== 'ready') return;
	if (!(await phoneAnswers(phone.spec, { device: phone.state.device }, tools))) {
		await restart(phone, 'not up when a chunk was waiting');
		return;
	}
	phone.checkedAt = Date.now();
	// Read again after the check: another phone of this platform may have taken the chunk meanwhile.
	const next = nextChunk(phone.spec.platform);
	if (next) await run(phone, next.job, next.name, next.chunk);
}

async function health(phone: Phone): Promise<void> {
	if (phone.state.state !== 'ready' || Date.now() - phone.checkedAt < HEALTH_EVERY_MS) return;
	phone.checkedAt = Date.now();
	if (!(await phoneAnswers(phone.spec, { device: phone.state.device }, tools)))
		await restart(phone, 'health check');
}

// A chunk left running by a runner that stopped has no owner now.
for (const id of jobIds()) {
	const job = jobDir(id);
	for (const name of chunkNames(job)) {
		const chunk = readJson<Chunk>(chunkFile(job, name))!;
		if (chunk.state === 'running')
			writeJson(chunkFile(job, name), transitionChunk(chunk, { type: 'abandon' }));
	}
}

const shutdown = () => {
	stopping = true;
	for (const child of children) child.kill('SIGTERM');
	for (const id of jobIds()) {
		const job = jobDir(id);
		for (const name of chunkNames(job)) {
			const chunk = readJson<Chunk>(chunkFile(job, name))!;
			if (chunk.state === 'running')
				writeJson(chunkFile(job, name), transitionChunk(chunk, { type: 'abandon' }));
		}
	}
	const record = readJson<DaemonRecord>(daemonFile());
	if (record?.pid === process.pid) writeJson(daemonFile(), { ...record, pid: -1 });
	log(`runner ${process.pid} stops`);
	process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

publish();
const busy = new Set<Phone>();
// Each phone takes chunks as soon as it is up: one phone waiting for the machine queue never holds back another.
for (const phone of phones) {
	busy.add(phone);
	void boot(phone, false).finally(() => busy.delete(phone));
}
for (;;) {
	for (const phone of phones) {
		if (busy.has(phone)) continue;
		const work =
			phone.state.state === 'ready' && nextChunk(phone.spec.platform)
				? takeNext(phone)
				: health(phone);
		busy.add(phone);
		void work
			.catch((error: unknown) =>
				log(
					`${phoneId(phone.spec)}: ${error instanceof Error ? error.stack : String(error)}`,
				),
			)
			.finally(() => busy.delete(phone));
	}
	finishJobs();
	await new Promise((resolve) => setTimeout(resolve, 2000));
}

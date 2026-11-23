#!/usr/bin/env node
// The remote end of remote.ts, run by pc/agent.sh as the PC's phone user from a checkout of the calling runner's commit.
// stdout carries only answers and result archives; logs go to stderr, which the runner appends to the chunk's log.
import { spawn, spawnSync } from 'node:child_process';
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { APP_SERVER_PORT } from '../../proofs/ladder.ts';
import { startBuiltServer } from '../../../../scripts/test-utils/built-server.ts';
import { bootEmulator, emulatorAnswers } from '../harness/android.ts';
import { startEchoServer } from '../harness/echo-server.ts';
import { androidTools } from '../harness/tools.ts';
import type { BundledRung } from './bundle.ts';
import { stopPhone } from './phones.ts';
import { AGENT_NOT_NOW } from './remote.ts';
import {
	bundleRung,
	chunkFile,
	chunkResultFile,
	type Chunk,
	type JobSpec,
	readJson,
	writeJson,
} from './store.ts';

const JOB_DAYS = 2;
const [caller, command, ...args] = process.argv.slice(2);
const home = homedir();
const jobs = join(home, 'jobs', caller ?? '');
const fail = (message: string, code = 1): never => {
	console.error(message);
	process.exit(code);
};
const jobPath = (id: string | undefined) =>
	id && /^[\w-]+$/.test(id) ? join(jobs, id) : fail(`not a job id: ${id}`);
const readStdin = async () => {
	const parts: Buffer[] = [];
	for await (const part of process.stdin) parts.push(part as Buffer);
	return Buffer.concat(parts).toString('utf8');
};
const ran = (bin: string, argv: string[], options: Parameters<typeof spawnSync>[2] = {}) => {
	const result = spawnSync(bin, argv, { stdio: ['inherit', 2, 2], ...options });
	if (result.status !== 0) fail(`${bin} ${argv[0]} failed (${result.status})`);
};

/** The test servers' ports are fixed, so chunks that need a server take turns across every caller. */
async function holdServerPorts(): Promise<() => void> {
	const lock = join(home, 'locks', 'servers');
	mkdirSync(join(lock, '..'), { recursive: true });
	for (;;) {
		try {
			closeSync(openSync(lock, 'wx'));
			writeFileSync(lock, String(process.pid));
			return () => rmSync(lock, { force: true });
		} catch {
			const holder = Number(readFileSync(lock, 'utf8') || 0);
			try {
				if (holder > 0) process.kill(holder, 0);
			} catch {
				rmSync(lock, { force: true });
				continue;
			}
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}
}

const tools = await androidTools();
const device = (port: string | undefined) => `emulator-${Number(port)}`;
const spec = (avd: string, port: string | undefined) =>
	({ platform: 'android', avd, port: Number(port) }) as const;

switch (command) {
	case 'boot': {
		const [avd, port, mode] = args;
		if (!avd || !/^\w+$/.test(avd)) fail(`not an AVD name: ${avd}`);
		if (mode === 'fresh') await stopPhone(spec(avd!, port), tools);
		console.log((await bootEmulator(tools, avd!, Number(port))).serial);
		break;
	}
	case 'answers':
		console.log((await emulatorAnswers(tools, device(args[0]))) ? 'yes' : 'no');
		break;
	case 'stop':
		await stopPhone(spec('stopped', args[0]), tools);
		break;
	case 'put': {
		const job = jobPath(args[0]);
		mkdirSync(jobs, { recursive: true });
		for (const old of readdirSync(jobs))
			if (Date.now() - statSync(join(jobs, old)).mtimeMs > JOB_DAYS * 86_400_000)
				rmSync(join(jobs, old), { recursive: true, force: true });
		rmSync(job, { recursive: true, force: true });
		mkdirSync(job, { recursive: true });
		ran('tar', ['-x', '-f', '-', '--warning=no-unknown-keyword', '-C', job]);
		break;
	}
	case 'run': {
		const [id, name, port, driver] = args;
		const job = jobPath(id);
		if (!name || !/^[\w-]+$/.test(name)) fail(`not a chunk name: ${name}`);
		if (!existsSync(join(job, 'job.json'))) fail(`job ${id} was not sent`, AGENT_NOT_NOW);
		const chunk = JSON.parse(await readStdin()) as Chunk;
		if (chunk.platform !== 'android') fail('only Android chunks run here');
		writeJson(chunkFile(job, name!), chunk);
		rmSync(chunkResultFile(job, name!), { force: true });
		// The job's Dragon is the PC's checkout of the same commit, which agent.sh prepares.
		const jobSpec = readJson<JobSpec>(join(job, 'job.json'))!;
		if (jobSpec.dragon) {
			const dragon = join(home, 'dragon', jobSpec.dragon.commit);
			if (!existsSync(join(dragon, '.ready'))) {
				spawn(process.env.PC_PHONES_AGENT!, ['prepare-dragon', jobSpec.dragon.commit], {
					detached: true,
					stdio: 'ignore',
				}).unref();
				fail(`preparing Dragon ${jobSpec.dragon.commit}`, AGENT_NOT_NOW);
			}
			writeJson(join(job, 'job.json'), {
				...jobSpec,
				dragon: {
					dir: dragon,
					commit: jobSpec.dragon.commit,
					zig: process.env.MARKLESS_ZIG,
				},
			} satisfies JobSpec);
		}
		const servers = chunk.rungs.map(
			(rung) => readJson<BundledRung>(join(bundleRung(job, rung), 'rung.json'))?.server,
		);
		const held: Array<{ close: () => Promise<void> }> = [];
		const release = servers.some(Boolean) ? await holdServerPorts() : () => {};
		if (servers.includes('echo')) held.push(await startEchoServer());
		const app = chunk.rungs[servers.indexOf('app')];
		if (app)
			held.push(
				await startBuiltServer(
					join(bundleRung(job, app), 'server', 'server', 'index.mjs'),
					{
						port: APP_SERVER_PORT,
						env: { PATH: process.env.PATH, HOST: '127.0.0.1' },
					},
				),
			);
		const child = spawn(
			process.execPath,
			[
				join(import.meta.dirname, 'run-chunk.ts'),
				job,
				name!,
				device(port),
				driver ?? 'reinstall-driver',
			],
			{ stdio: ['ignore', 2, 2] },
		);
		await new Promise<void>((resolve) => child.on('exit', () => resolve()));
		for (const server of held) await server.close();
		release();
		const shots = chunk.rungs
			.map((rung) => join('screenshots', rung, 'android'))
			.filter((path) => existsSync(join(job, path)));
		const result = join('chunks', `${name}.result.json`);
		ran(
			'tar',
			[
				'-c',
				'-f',
				'-',
				'-C',
				job,
				...(existsSync(join(job, result)) ? [result] : []),
				...shots,
			],
			{
				stdio: ['ignore', 'inherit', 2],
			},
		);
		break;
	}
	default:
		fail(`unknown command ${command}`);
}

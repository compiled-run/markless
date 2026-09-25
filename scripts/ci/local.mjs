#!/usr/bin/env node
// Runs a workflow's check steps locally; commands come from the YAML, only per-job local policy lives here.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(
	process.env.MARKLESS_CI_LOCAL_ROOT ?? resolve(dirname(scriptPath), '../..'),
);
const require = createRequire(resolve(repoRoot, 'package.json'));

const USAGE = `usage: node scripts/ci/local.mjs [--list] [--fast | --full] [--job <id>]... [options]

  --list            print every job and step the workflow defines, and what runs locally
  --fast            run the fast jobs (default)
  --full            run every job that can run on this machine
  --job <id>        run only this job (repeatable); overrides --fast/--full
  --workflow <file> workflow to read (default .github/workflows/ci.yml)
  --install         also run the setup steps (pnpm install, Playwright browsers) first
  --clean           run in a throwaway worktree of HEAD, so untracked files cannot help
  --linux           run inside a Linux container (needs docker; see docs/ci-process.md)
  --keep-going      keep running jobs after one fails (default: on)
  --bail            stop at the first failing job
  --dry-run         print the commands without running them`;

// A job with check steps but no entry here fails --list and every run, so this table cannot drift from the YAML.
const JOB_POLICY = {
	'ci.yml': {
		'agent-files': { mode: 'fast' },
		typecheck: { mode: 'fast' },
		unit: { mode: 'fast' },
		browser: { mode: 'full', needsBrowser: true },
		'completion-matrix': { mode: 'full' },
		'boxes-bundler': { mode: 'full', needsBrowser: true },
		'boxes-router': { mode: 'full', needsBrowser: true },
		'boxes-music-player': { mode: 'full', needsBrowser: true },
		'boxes-music-player-ssr': { mode: 'full', needsBrowser: true },
		receipts: { mode: 'full' },
		'package-manager-matrix': { mode: 'full', tools: ['bun', 'deno', 'corepack'] },
		benchmark: {
			mode: 'ci-only',
			reason: 'clones js-framework-benchmark, builds a baseline worktree and runs 30 minutes of interleaved Chrome pairs; run `pnpm bench:jsfb:prepare` and the JSFB runner by hand when a diff can reach the benchmark bundles',
		},
		'benchmark-guard': {
			mode: 'ci-only',
			reason: 'compares the benchmark job artifacts; nothing to compare without them',
		},
	},
	'screen-reader.yml': {
		virtual: { mode: 'full', needsBrowser: true },
		nvda: { mode: 'ci-only', reason: 'needs a Windows runner with NVDA installed' },
		voiceover: {
			mode: 'ci-only',
			reason: 'needs a macOS runner with VoiceOver automation granted; run `pnpm test:sr-real` by hand on a prepared Mac',
		},
	},
};

const SETUP_COMMANDS = [
	/^pnpm install\b/,
	/^corepack enable\b/,
	/\bplaywright install\b/,
	/^mkdir -p\b/,
];
const CI_ONLY_COMMANDS = [/^echo ok > \S+-completed\.txt$/];
const CI_ONLY_CONDITION = /\b(needs|steps|github|runner)\./;
const SHARD_ARG = /\s+--shard[= ]\$\{\{\s*matrix\.shard\s*\}\}/g;

const parseArgs = (argv) => {
	const options = {
		mode: 'fast',
		jobs: [],
		workflow: '.github/workflows/ci.yml',
		install: false,
		clean: false,
		linux: false,
		list: false,
		bail: false,
		dryRun: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--list') options.list = true;
		else if (arg === '--fast') options.mode = 'fast';
		else if (arg === '--full') options.mode = 'full';
		else if (arg === '--job') options.jobs.push(argv[++index]);
		else if (arg === '--workflow') options.workflow = argv[++index];
		else if (arg === '--install') options.install = true;
		else if (arg === '--clean') options.clean = true;
		else if (arg === '--linux') options.linux = true;
		else if (arg === '--bail') options.bail = true;
		else if (arg === '--keep-going') options.bail = false;
		else if (arg === '--dry-run') options.dryRun = true;
		else if (arg === '--help' || arg === '-h') {
			console.log(USAGE);
			process.exit(0);
		} else {
			console.error(`unknown argument: ${arg}\n\n${USAGE}`);
			process.exit(2);
		}
	}
	return options;
};

const loadYaml = () => {
	for (const base of ['package.json', 'packages/cli/package.json']) {
		try {
			return createRequire(resolve(repoRoot, base))('yaml');
		} catch {
			continue;
		}
	}
	console.error('Cannot resolve the `yaml` package. Run `pnpm install` first.');
	process.exit(1);
};

const plainEnv = (env = {}) =>
	Object.fromEntries(
		Object.entries(env)
			.filter(([, value]) => !String(value).includes('${{'))
			.map(([key, value]) => [key, String(value)]),
	);

const matrixCombos = (job) => {
	const matrix = job.strategy?.matrix;
	if (!matrix || typeof matrix !== 'object') return [{}];
	const axes = Object.entries(matrix).filter(
		([key, values]) => key !== 'include' && key !== 'exclude' && Array.isArray(values),
	);
	// Shards split one command across runners; locally the unsharded command covers them all.
	const expandable = axes.filter(([key]) => key !== 'shard');
	let combos = [{}];
	for (const [key, values] of expandable)
		combos = combos.flatMap((combo) => values.map((value) => ({ ...combo, [key]: value })));
	const shard = axes.find(([key]) => key === 'shard');
	return shard ? combos.map((combo) => ({ ...combo, shard: shard[1][0] })) : combos;
};

const substituteMatrix = (text, combo) =>
	String(text)
		.replace(SHARD_ARG, '')
		.replace(/\$\{\{\s*matrix\.([\w-]+)\s*\}\}/g, (whole, key) =>
			key in combo ? String(combo[key]) : whole,
		);

const matrixCondition = (condition, combo) => {
	const match = /^\s*matrix\.([\w-]+)\s*==\s*'([^']*)'\s*$/.exec(condition);
	if (!match) return null;
	return String(combo[match[1]]) === match[2];
};

const classifyStep = (step, combo) => {
	const name = substituteMatrix(step.name ?? step.uses ?? '(unnamed)', combo);
	if (step.uses) return { name, kind: 'ci-only', why: `action ${step.uses}` };
	const command = substituteMatrix(step.run ?? '', combo).trim();
	if (SETUP_COMMANDS.some((pattern) => pattern.test(command)))
		return {
			name,
			kind: 'setup',
			command,
			env: plainEnv(step.env),
			cwd: step['working-directory'],
		};
	if (step.if !== undefined) {
		const condition = String(step.if);
		const verdict = matrixCondition(condition, combo);
		if (verdict === false)
			return {
				name,
				kind: 'ci-only',
				why: `condition ${condition.trim()} is false for this matrix entry`,
				command,
			};
		if (verdict === null && CI_ONLY_CONDITION.test(condition))
			return { name, kind: 'ci-only', why: 'condition depends on CI orchestration', command };
	}
	if (CI_ONLY_COMMANDS.some((pattern) => pattern.test(command)))
		return { name, kind: 'ci-only', why: 'lane cache marker', command };
	if (command.includes('${{'))
		return { name, kind: 'ci-only', why: 'command reads GitHub context', command };
	return {
		name,
		kind: 'check',
		command,
		env: plainEnv(step.env),
		cwd: step['working-directory'],
	};
};

const readWorkflow = (workflowPath) => {
	const yaml = loadYaml();
	const absolute = resolve(repoRoot, workflowPath);
	const doc = yaml.parse(readFileSync(absolute, 'utf8'));
	const file = absolute.split('/').pop();
	const policy = JOB_POLICY[file] ?? {};
	const jobs = [];
	for (const [id, job] of Object.entries(doc.jobs ?? {})) {
		const runs = [];
		const seen = new Set();
		for (const combo of matrixCombos(job)) {
			const steps = (job.steps ?? []).map((step) => classifyStep(step, combo));
			const key = JSON.stringify(steps.map((step) => [step.kind, step.command]));
			if (seen.has(key)) continue;
			seen.add(key);
			runs.push({ combo, steps });
		}
		const hasChecks = runs.some((run) => run.steps.some((step) => step.kind === 'check'));
		const jobPolicy = policy[id];
		let mode;
		let reason;
		if (!hasChecks) {
			mode = 'orchestration';
			reason = 'no check steps: lane hashing, gates, or cache bookkeeping';
		} else if (!jobPolicy) {
			mode = 'unknown';
			reason = `job has check steps but no local policy; add "${id}" to JOB_POLICY in scripts/ci/local.mjs`;
		} else {
			mode = jobPolicy.mode;
			reason = jobPolicy.reason;
		}
		jobs.push({
			id,
			env: { ...plainEnv(doc.env), ...plainEnv(job.env) },
			runs,
			mode,
			reason,
			policy: jobPolicy ?? {},
			runsOn: job['runs-on'],
		});
	}
	return { file, jobs };
};

const comboLabel = (combo) => {
	const entries = Object.entries(combo).filter(([key]) => key !== 'shard');
	return entries.length
		? ` (${entries.map(([key, value]) => `${key}=${value}`).join(', ')})`
		: '';
};

const printList = ({ file, jobs }) => {
	console.log(`${file}: ${jobs.length} jobs\n`);
	for (const job of jobs) {
		console.log(`${job.id}  [${job.mode}]${job.reason ? `  ${job.reason}` : ''}`);
		const runs =
			job.runs.length > 6 ? [...job.runs.slice(0, 3), null, job.runs.at(-1)] : job.runs;
		for (const run of runs) {
			if (run === null) {
				console.log(`    ... ${job.runs.length - 4} more matrix entries`);
				continue;
			}
			if (job.runs.length > 1)
				console.log(`  matrix${comboLabel(run.combo) || ' (one local run)'}`);
			for (const step of run.steps) {
				if (step.kind === 'ci-only' && !step.command) continue;
				const tag =
					step.kind === 'check' ? 'check' : step.kind === 'setup' ? 'setup' : 'skip ';
				const firstLine = (step.command ?? '').split('\n')[0];
				console.log(
					`    ${tag}  ${step.name}${firstLine ? `: ${firstLine}${step.command.includes('\n') ? ' ...' : ''}` : ''}${step.kind === 'ci-only' ? `  (${step.why})` : ''}`,
				);
			}
		}
	}
};

const which = (tool) =>
	spawnSync('sh', ['-c', `command -v ${tool}`], { stdio: 'ignore' }).status === 0;

const chromiumInstalled = () => {
	try {
		const { chromium } = require('@playwright/test');
		return (
			Boolean(chromium.executablePath()) &&
			spawnSync('test', ['-e', chromium.executablePath()]).status === 0
		);
	} catch {
		return null;
	}
};

const runShell = (command, { cwd, env }) =>
	spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', command], {
		cwd,
		env,
		stdio: 'inherit',
	}).status ?? 1;

const selectJobs = (workflow, options) => {
	const unknown = workflow.jobs.filter((job) => job.mode === 'unknown');
	if (unknown.length) {
		for (const job of unknown) console.error(`error: ${job.reason}`);
		process.exit(2);
	}
	if (options.jobs.length) {
		const missing = options.jobs.filter((id) => !workflow.jobs.some((job) => job.id === id));
		if (missing.length) {
			console.error(`error: no such job in ${workflow.file}: ${missing.join(', ')}`);
			process.exit(2);
		}
		return workflow.jobs.filter((job) => options.jobs.includes(job.id));
	}
	const wanted = options.mode === 'fast' ? ['fast'] : ['fast', 'full'];
	return workflow.jobs.filter((job) => wanted.includes(job.mode));
};

const runJobs = (workflow, options) => {
	const selected = selectJobs(workflow, options);
	const results = [];
	const baseEnv = { ...process.env, CI: 'true' };

	if (options.install) {
		const canInstallSystemDeps = process.platform === 'linux' && process.getuid?.() === 0;
		const setup = [];
		for (const job of selected)
			for (const run of job.runs)
				for (const step of run.steps)
					if (
						step.kind === 'setup' &&
						!setup.includes(step.command) &&
						(canInstallSystemDeps || !/install-deps/.test(step.command))
					)
						setup.push(step.command);
		for (const command of setup) {
			console.log(`\n[setup] ${command}`);
			if (!options.dryRun && runShell(command, { cwd: repoRoot, env: baseEnv }) !== 0) {
				console.error(`setup failed: ${command}`);
				process.exit(1);
			}
		}
	}

	const browserReady = chromiumInstalled();
	for (const job of selected) {
		const missingTools = (job.policy.tools ?? []).filter((tool) => !which(tool));
		if (missingTools.length) {
			results.push({
				id: job.id,
				status: 'skipped',
				note: `missing ${missingTools.join(', ')} on PATH`,
			});
			continue;
		}
		if (job.policy.needsBrowser && browserReady === false && !options.dryRun) {
			results.push({
				id: job.id,
				status: 'skipped',
				note: 'Playwright Chromium not installed; rerun with --install',
			});
			continue;
		}
		const started = Date.now();
		let failed = null;
		const ran = new Set();
		for (const run of job.runs) {
			for (const step of run.steps) {
				if (step.kind !== 'check' || ran.has(step.command)) continue;
				ran.add(step.command);
				const label = `${job.id}${comboLabel(run.combo)} :: ${step.name}`;
				console.log(`\n=== ${label}\n$ ${step.command}`);
				if (options.dryRun) continue;
				const status = runShell(step.command, {
					cwd: step.cwd ? resolve(repoRoot, step.cwd) : repoRoot,
					env: { ...baseEnv, ...job.env, ...step.env },
				});
				if (status !== 0) {
					failed = label;
					break;
				}
			}
			if (failed) break;
		}
		const seconds = Math.round((Date.now() - started) / 1000);
		results.push({
			id: job.id,
			status: failed ? 'failed' : options.dryRun ? 'listed' : 'passed',
			note: failed ? `failed at ${failed}` : `${seconds}s`,
		});
		if (failed && options.bail) break;
	}

	const notRun = workflow.jobs.filter(
		(job) => !selected.includes(job) && job.mode !== 'orchestration',
	);
	console.log(
		`\n${workflow.file} local run (${options.jobs.length ? 'selected jobs' : options.mode})`,
	);
	for (const result of results)
		console.log(`  ${result.status.padEnd(7)} ${result.id}  ${result.note}`);
	for (const job of notRun)
		console.log(`  not run ${job.id}  [${job.mode}]${job.reason ? ` ${job.reason}` : ''}`);
	return results.some((result) => result.status === 'failed') ? 1 : 0;
};

const forwardedArgs = (argv) => argv.filter((arg) => arg !== '--clean');

const runClean = (argv) => {
	const worktree = mkdtempSync(join(tmpdir(), 'markless-ci-local-'));
	rmSync(worktree, { recursive: true, force: true });
	const git = (...args) =>
		spawnSync('git', ['-C', repoRoot, ...args], { stdio: 'inherit' }).status;
	if (git('worktree', 'add', '--detach', worktree, 'HEAD') !== 0) return 1;
	try {
		console.log(
			`clean worktree of HEAD at ${worktree} (uncommitted and untracked files are not in it)`,
		);
		const install = spawnSync('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], {
			cwd: worktree,
			stdio: 'inherit',
		}).status;
		if (install !== 0) return install ?? 1;
		return (
			spawnSync(process.execPath, [scriptPath, ...forwardedArgs(argv)], {
				cwd: worktree,
				env: { ...process.env, MARKLESS_CI_LOCAL_ROOT: worktree },
				stdio: 'inherit',
			}).status ?? 1
		);
	} finally {
		git('worktree', 'remove', '--force', worktree);
	}
};

// One container per job, fed the committed tree and only that job's own setup steps, as a fresh runner would be.
const LINUX_IMAGE = 'node:24-bookworm';
const runLinux = (options) => {
	if (!which('docker')) {
		console.error(
			'--linux needs docker (or a docker-compatible CLI such as colima or OrbStack). None is on PATH. See docs/ci-process.md "Linux parity".',
		);
		return 2;
	}
	const workflow = readWorkflow(options.workflow);
	const archive = spawnSync('git', ['-C', repoRoot, 'archive', '--format=tar', 'HEAD'], {
		maxBuffer: 1 << 30,
	});
	if (archive.status !== 0) return archive.status ?? 1;
	const results = [];
	for (const job of selectJobs(workflow, options)) {
		const inner = [
			'set -eo pipefail',
			'mkdir -p /work && tar -x -C /work && cd /work',
			'git init -q && git add -A && git -c user.name=ci -c user.email=ci@localhost commit -qm tree',
			'corepack enable && corepack prepare pnpm@10.33.2 --activate >/dev/null',
			'pnpm install --frozen-lockfile',
			`node scripts/ci/local.mjs --workflow ${options.workflow} --install --job ${job.id}`,
		].join('\n');
		console.log(`\n### ${job.id} in ${LINUX_IMAGE}`);
		const status = spawnSync(
			'docker',
			['run', '--rm', '-i', '--platform', 'linux/amd64', LINUX_IMAGE, 'bash', '-c', inner],
			{ input: archive.stdout, stdio: ['pipe', 'inherit', 'inherit'] },
		).status;
		results.push({ id: job.id, status: status === 0 ? 'passed' : 'failed' });
		if (status !== 0 && options.bail) break;
	}
	for (const result of results) console.log(`  ${result.status.padEnd(7)} ${result.id} (linux)`);
	return results.some((result) => result.status === 'failed') ? 1 : 0;
};

const argv = process.argv.slice(2);
const options = parseArgs(argv);
if (options.linux) process.exit(runLinux(options));
if (options.clean) process.exit(runClean(argv));
const workflow = readWorkflow(options.workflow);
if (options.list) {
	printList(workflow);
	const unknown = workflow.jobs.filter((job) => job.mode === 'unknown');
	process.exit(unknown.length ? 2 : 0);
}
process.exit(runJobs(workflow, options));

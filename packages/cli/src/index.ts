import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { basename, dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

declare const __VERSION__: string | undefined;

export type ProjectFormat = 'node' | 'bun' | 'deno';
export type Starter = 'minimal' | 'app' | 'docs' | 'full-stack';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'deno';

export type Choice<T extends string> = {
	readonly value: T;
	readonly label: string;
	readonly hint: string;
};

export const PROJECT_FORMAT_CHOICES = [
	{ value: 'node', label: 'Node', hint: 'package.json' },
	{ value: 'bun', label: 'Bun', hint: 'package.json' },
	{ value: 'deno', label: 'Deno', hint: 'deno.json' },
] as const satisfies readonly Choice<ProjectFormat>[];

export const STARTER_CHOICES = [
	{ value: 'minimal', label: 'Minimal', hint: 'one page' },
	{ value: 'app', label: 'App', hint: 'document shell and status pages' },
	{ value: 'docs', label: 'Docs', hint: 'MDX pages' },
	{
		value: 'full-stack',
		label: 'Full-stack',
		hint: 'app plus api/ and middleware/',
	},
] as const satisfies readonly Choice<Starter>[];

export interface ProgramRuntime {
	cwd(): string;
	env: Record<string, string | undefined>;
	isTTY: boolean;
	stdout?: Pick<NodeJS.WriteStream, 'write'>;
	stderr?: Pick<NodeJS.WriteStream, 'write'>;
	spawn?: (
		command: string,
		args: readonly string[],
		options: SpawnSyncOptions,
	) => ReturnType<typeof spawnSync>;
}

export interface CreateProgramConfig {
	name: string;
	description: string;
	version: string;
}

export interface ValidatedCreateInput {
	target?: string;
	format?: ProjectFormat;
	starter?: Starter;
	install?: boolean;
	git?: boolean;
	yes: boolean;
	force: boolean;
	help: boolean;
	version: boolean;
	cwd: string;
	packageManager: PackageManager;
}

export interface CreateOptions {
	target: string;
	format: ProjectFormat;
	starter: Starter;
	install: boolean;
	git: boolean;
	force: boolean;
	packageManager: PackageManager;
	cwd: string;
}

type StarterFile = {
	readonly path: string;
	readonly contents: string;
};

const TEMPLATE_ROOT = new URL('../templates/', import.meta.url);

export class CreateProgram {
	configure(): CreateProgramConfig {
		return {
			name: 'create-arcade',
			version: typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0',
			description: 'Create Arcade apps',
		};
	}

	validate(args: readonly string[], runtime = defaultRuntime()): ValidatedCreateInput {
		const parsed = parseArgs(args);

		if (parsed.target) {
			validateTarget(parsed.target);
		}

		if (parsed.yes && !parsed.target) {
			throw new Error('Project name is required when running non-interactively.');
		}

		if (!runtime.isTTY && !parsed.target && !parsed.help && !parsed.version) {
			throw new Error('Project name is required when running non-interactively.');
		}

		return {
			...parsed,
			cwd: runtime.cwd(),
			packageManager: inferPackageManager(runtime.env),
		};
	}

	async interact(
		input: ValidatedCreateInput,
		runtime = defaultRuntime(),
	): Promise<CreateOptions> {
		if (input.yes || !runtime.isTTY) {
			return {
				target: input.target!,
				format: input.format ?? 'node',
				starter: input.starter ?? 'minimal',
				install: input.install ?? true,
				git: input.git ?? true,
				force: input.force,
				packageManager: input.packageManager,
				cwd: input.cwd,
			};
		}

		throw new Error('Interactive create prompts are not wired yet. Pass --yes for now.');
	}

	async execute(options: CreateOptions, runtime = defaultRuntime()): Promise<void> {
		const targetDir = resolve(options.cwd, options.target);

		await ensureWritableTarget(targetDir, options.force);
		await writeStarter(options, targetDir);

		if (options.git) {
			runCommand(runtime, 'git', ['init'], targetDir);
		}

		if (options.install) {
			runCommand(runtime, options.packageManager, ['install'], targetDir);
		}

		runtime.stdout?.write(`Created ${options.target}\n`);
		runtime.stdout?.write(`Next:\n  cd ${options.target}\n  ${options.packageManager} dev\n`);
	}

	async run(args: readonly string[], runtime = defaultRuntime()): Promise<void> {
		const input = this.validate(args, runtime);

		if (input.help) {
			runtime.stdout?.write(helpText(this.configure()));
			return;
		}

		if (input.version) {
			runtime.stdout?.write(`${this.configure().version}\n`);
			return;
		}

		const options = await this.interact(input, runtime);
		await this.execute(options, runtime);
	}
}

function parseArgs(args: readonly string[]): ValidatedCreateInput {
	const parsed: ValidatedCreateInput = {
		yes: false,
		force: false,
		help: false,
		version: false,
		cwd: '',
		packageManager: 'npm',
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg) continue;

		if (!arg.startsWith('-')) {
			if (parsed.target) throw new Error(`Unexpected argument: ${arg}`);
			parsed.target = arg;
			continue;
		}

		if (arg === '--yes' || arg === '-y') {
			parsed.yes = true;
			continue;
		}
		if (arg === '--force') {
			parsed.force = true;
			continue;
		}
		if (arg === '--install') {
			parsed.install = true;
			continue;
		}
		if (arg === '--no-install') {
			parsed.install = false;
			continue;
		}
		if (arg === '--git') {
			parsed.git = true;
			continue;
		}
		if (arg === '--no-git') {
			parsed.git = false;
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			parsed.help = true;
			continue;
		}
		if (arg === '--version' || arg === '-v') {
			parsed.version = true;
			continue;
		}
		if (arg === '--format' || arg.startsWith('--format=')) {
			parsed.format = readChoice(
				'format',
				arg,
				arg.includes('=') ? undefined : args[++index],
				PROJECT_FORMAT_CHOICES,
			);
			continue;
		}
		if (arg === '--starter' || arg.startsWith('--starter=')) {
			parsed.starter = readChoice(
				'starter',
				arg,
				arg.includes('=') ? undefined : args[++index],
				STARTER_CHOICES,
			);
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return parsed;
}

function readChoice<T extends string>(
	name: string,
	arg: string,
	next: string | undefined,
	choices: readonly Choice<T>[],
): T {
	const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : next;

	if (!value) throw new Error(`Missing value for --${name}.`);
	if (!choices.some((choice) => choice.value === value)) {
		throw new Error(`Unsupported ${name}: ${value}`);
	}

	return value as T;
}

function validateTarget(target: string): true {
	if (!target.trim()) throw new Error('Project name cannot be empty.');
	if (target.includes('\0')) throw new Error('Project name contains invalid path characters.');
	return true;
}

async function ensureWritableTarget(targetDir: string, force: boolean): Promise<void> {
	const targetStat = await stat(targetDir).catch(() => null);

	if (!targetStat) {
		await mkdir(targetDir, { recursive: true });
		return;
	}

	if (!targetStat.isDirectory()) {
		throw new Error(`Target exists and is not a directory: ${targetDir}`);
	}

	const files = await readdir(targetDir);
	if (files.length > 0 && !force) {
		throw new Error(`Target directory is not empty: ${targetDir}`);
	}
}

async function writeStarter(options: CreateOptions, targetDir: string): Promise<void> {
	const files = await starterFiles(options);

	await Promise.all(
		files.map(async (file) => {
			const path = resolve(targetDir, file.path);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, file.contents);
		}),
	);
}

async function starterFiles(options: CreateOptions): Promise<StarterFile[]> {
	const directories = [
		new URL('common/', TEMPLATE_ROOT),
		new URL(`formats/${options.format}/`, TEMPLATE_ROOT),
		...starterTemplateDirectories(options.starter),
	];
	const files = (
		await Promise.all(directories.map((directory) => readTemplateDirectory(directory)))
	).flat();

	return renderTemplateFiles(files, {
		packageManager: options.packageManager,
		packageName: packageName(options.target),
	});
}

function starterTemplateDirectories(starter: Starter): URL[] {
	if (starter === 'docs') {
		return [new URL('starters/docs/', TEMPLATE_ROOT)];
	}

	const directories = [new URL('starters/minimal/', TEMPLATE_ROOT)];
	if (starter === 'app' || starter === 'full-stack') {
		directories.push(new URL('starters/app/', TEMPLATE_ROOT));
	}
	if (starter === 'full-stack') {
		directories.push(new URL('starters/full-stack/', TEMPLATE_ROOT));
	}

	return directories;
}

async function readTemplateDirectory(directory: URL, pathPrefix = ''): Promise<StarterFile[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = `${pathPrefix}${entry.name}`;
			const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);

			if (entry.isDirectory()) return readTemplateDirectory(url, `${path}/`);
			if (!entry.isFile()) return [];

			return [{ path, contents: await readFile(url, 'utf-8') }];
		}),
	);

	return files.flat();
}

function renderTemplateFiles(
	files: readonly StarterFile[],
	context: Record<string, string>,
): StarterFile[] {
	return files.map((file) => ({
		...file,
		contents: file.contents.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (match, name) => {
			return context[name] ?? match;
		}),
	}));
}

function packageName(target: string): string {
	const name = basename(withoutTrailingSlash(normalize(target)))
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return name || 'arcade-app';
}

function withoutTrailingSlash(value: string): string {
	return value.replace(/[\\/]+$/, '');
}

function inferPackageManager(env: ProgramRuntime['env']): PackageManager {
	const userAgent = env.npm_config_user_agent ?? '';

	if (userAgent.startsWith('pnpm/')) return 'pnpm';
	if (userAgent.startsWith('yarn/')) return 'yarn';
	if (userAgent.startsWith('bun/')) return 'bun';
	if (userAgent.startsWith('deno/')) return 'deno';
	return 'npm';
}

function runCommand(
	runtime: ProgramRuntime,
	command: string,
	args: readonly string[],
	cwd: string,
): void {
	const spawn = runtime.spawn ?? spawnSync;
	const result = spawn(command, [...args], { cwd, stdio: 'inherit' });

	if (result.status !== 0) {
		throw new Error(`Command failed: ${command} ${args.join(' ')}`);
	}
}

function helpText(config: CreateProgramConfig): string {
	return `${config.name}

${config.description}

Usage:
  create-arcade <target> [--yes]

Options:
  --yes, -y          Use defaults
  --format <name>   node, bun, or deno
  --starter <name>  minimal, app, docs, or full-stack
  --no-install      Skip dependency installation
  --no-git          Skip git initialization
  --force           Write into a non-empty directory
`;
}

function defaultRuntime(): ProgramRuntime {
	return {
		cwd: () => process.cwd(),
		env: process.env,
		isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
		stdout: process.stdout,
		stderr: process.stderr,
		spawn: spawnSync,
	};
}

async function runCli(): Promise<void> {
	const args = process.argv.slice(2);
	const command = basename(process.argv[1] ?? '');
	const createArgs = command === 'arcade' && args[0] === 'create' ? args.slice(1) : args;
	const program = new CreateProgram();

	await program.run(createArgs);
}

function isEntrypoint(scriptPath: string | undefined, moduleUrl: string): boolean {
	return scriptPath !== undefined && resolve(scriptPath) === fileURLToPath(moduleUrl);
}

if (isEntrypoint(process.argv[1], import.meta.url)) {
	await runCli();
}

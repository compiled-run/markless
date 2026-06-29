import { basename, dirname, normalize, resolve } from 'pathe';
import { withoutTrailingSlash } from 'ufo';

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
	{
		value: 'node',
		label: 'Node',
		hint: 'Creates a package.json project for pnpm, npm, or yarn.',
	},
	{ value: 'deno', label: 'Deno', hint: 'Creates a deno.json project with npm: imports.' },
	{ value: 'bun', label: 'Bun', hint: 'Creates a package.json project tuned for Bun.' },
] as const satisfies readonly Choice<ProjectFormat>[];

export const STARTER_CHOICES = [
	{
		value: 'minimal',
		label: 'Learn Arcade',
		hint: 'A small TSRX counter app. Best first project.',
	},
	{
		value: 'app',
		label: 'Build an app',
		hint: 'A routed app with document.tsrx plus 404 and 500 pages.',
	},
	{
		value: 'docs',
		label: 'Write docs',
		hint: 'An MDX docs site with a layout and sidebar components.',
	},
	{
		value: 'full-stack',
		label: 'Full-stack app',
		hint: 'App routes plus api/ and middleware/ files.',
	},
] as const satisfies readonly Choice<Starter>[];

export type ProgramPath = string | URL;

export interface ProgramDirectoryEntry {
	readonly name: string;
	readonly kind: 'directory' | 'file';
}

export interface ProgramFileStat {
	isDirectory(): boolean;
}

export interface ProgramFileSystem {
	mkdir(path: ProgramPath, options?: { readonly recursive?: boolean }): Promise<void>;
	readDirectory(path: ProgramPath): Promise<ReadonlyArray<ProgramDirectoryEntry>>;
	readFile(path: ProgramPath): Promise<string>;
	stat(path: ProgramPath): Promise<ProgramFileStat | null>;
	writeFile(path: ProgramPath, contents: string): Promise<void>;
}

export interface ProgramWritable {
	write(chunk: string): unknown;
}

export interface ProgramCommandOptions {
	readonly cwd: string;
	readonly stdio: 'inherit';
}

export interface ProgramCommandResult {
	readonly status: number | null;
}

export interface ProgramPromptTextOptions {
	readonly message: string;
	readonly placeholder?: string;
	readonly defaultValue?: string;
	readonly initialValue?: string;
	readonly validate?: (value: string) => string | undefined;
}

export interface ProgramPromptSelectOptions<T extends string> {
	readonly message: string;
	readonly options: readonly Choice<T>[];
	readonly initialValue: T;
}

export interface ProgramPrompts {
	intro(message: string): void;
	note(message: string, title?: string): void;
	select<T extends string>(options: ProgramPromptSelectOptions<T>): Promise<T>;
	text(options: ProgramPromptTextOptions): Promise<string>;
	outro(message: string): void;
	cancel(message: string): void;
}

export interface ProgramRuntime {
	cwd(): string;
	env: Record<string, string | undefined>;
	fs: ProgramFileSystem;
	isTTY: boolean;
	prompts?: ProgramPrompts;
	stdout?: ProgramWritable;
	stderr?: ProgramWritable;
	spawn?: (
		command: string,
		args: readonly string[],
		options: ProgramCommandOptions,
	) => ProgramCommandResult;
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

const DEFAULT_TARGET = 'my-arcade-app';
const TEMPLATE_ROOT = new URL('../templates/', import.meta.url);

export class CreateProgram {
	configure(): CreateProgramConfig {
		return {
			name: 'create-arcade',
			version: typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0',
			description: 'Create Arcade apps',
		};
	}

	validate(args: readonly string[], runtime: ProgramRuntime): ValidatedCreateInput {
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

	async interact(input: ValidatedCreateInput, runtime: ProgramRuntime): Promise<CreateOptions> {
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

		if (!runtime.prompts) {
			throw new Error(
				'Interactive create prompts require the current runtime to provide prompts.',
			);
		}

		const prompts = runtime.prompts;
		prompts.intro('Welcome to Arcade');
		prompts.note(
			'Choose a starting point, and Arcade will set up the routes, scripts, and defaults.',
			"Let's build you an app.",
		);
		const starter =
			input.starter ??
			(await prompts.select({
				initialValue: 'minimal',
				message: 'What are you building today?',
				options: STARTER_CHOICES,
			}));
		const target =
			input.target ??
			(await prompts.text({
				defaultValue: DEFAULT_TARGET,
				initialValue: DEFAULT_TARGET,
				message: 'What should we call it?',
				placeholder: DEFAULT_TARGET,
				validate: validateTargetMessage,
			}));
		const format =
			input.format ??
			(await prompts.select({
				initialValue: 'node',
				message: 'Where should it run?',
				options: PROJECT_FORMAT_CHOICES,
			}));
		const install =
			input.install ??
			(await prompts.select({
				initialValue: 'yes',
				message: 'Install dependencies now?',
				options: [
					{
						value: 'yes',
						label: 'Yes',
						hint: `Runs ${input.packageManager} install after files are created.`,
					},
					{
						value: 'no',
						label: 'No',
						hint: 'Leaves dependencies for you to install later.',
					},
				],
			})) === 'yes';
		const git =
			input.git ??
			(await prompts.select({
				initialValue: 'yes',
				message: 'Initialize git?',
				options: [
					{ value: 'yes', label: 'Yes', hint: 'Runs git init in the app directory.' },
					{ value: 'no', label: 'No', hint: 'Leaves version control untouched.' },
				],
			})) === 'yes';
		const options = {
			target,
			format,
			starter,
			install,
			git,
			force: input.force,
			packageManager: input.packageManager,
			cwd: input.cwd,
		};

		prompts.note(creationSummary(options), 'Ready to create?');
		const action = await prompts.select({
			initialValue: 'create',
			message: 'Ready to create?',
			options: [
				{ value: 'create', label: 'Create app', hint: '' },
				{ value: 'cancel', label: 'Cancel', hint: '' },
			],
		});

		if (action !== 'create') {
			prompts.cancel('Create cancelled.');
			throw new Error('Create cancelled.');
		}

		return options;
	}

	async execute(options: CreateOptions, runtime: ProgramRuntime): Promise<void> {
		const targetDir = resolve(options.cwd, options.target);

		await ensureWritableTarget(targetDir, options.force, runtime.fs);
		await writeStarter(options, targetDir, runtime.fs);

		if (options.git) {
			runCommand(runtime, 'git', ['init'], targetDir);
		}

		if (options.install) {
			runCommand(runtime, options.packageManager, ['install'], targetDir);
		}

		if (runtime.prompts) {
			runtime.prompts.note(nextSteps(options), `Created ${options.target}`);
			runtime.prompts.outro('Arcade app ready.');
			return;
		}

		runtime.stdout?.write(`Created ${options.target}\n\n${nextSteps(options)}\n`);
	}

	async run(args: readonly string[], runtime: ProgramRuntime): Promise<void> {
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

function choiceLabel<T extends string>(choices: readonly Choice<T>[], value: T): string {
	return choices.find((choice) => choice.value === value)?.label ?? value;
}

function creationSummary(options: CreateOptions): string {
	return [
		`App:      ${options.target}`,
		`Starter:  ${choiceLabel(STARTER_CHOICES, options.starter)}`,
		`Runtime:  ${choiceLabel(PROJECT_FORMAT_CHOICES, options.format)}`,
		`Install:  ${options.install ? `Yes, with ${options.packageManager}` : 'No'}`,
		`Git:      ${options.git ? 'Yes' : 'No'}`,
	].join('\n');
}

function nextSteps(options: CreateOptions): string {
	return [
		'Next steps:',
		`  cd ${options.target}`,
		`  ${options.packageManager} dev`,
		'',
		'Then open:',
		'  http://localhost:5173',
	].join('\n');
}

function validateTarget(target: string): true {
	if (!target.trim()) throw new Error('Project name cannot be empty.');
	if (target.includes('\0')) throw new Error('Project name contains invalid path characters.');
	return true;
}

function validateTargetMessage(target: string): string | undefined {
	try {
		validateTarget(target);
		return undefined;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

async function ensureWritableTarget(
	targetDir: string,
	force: boolean,
	fs: ProgramFileSystem,
): Promise<void> {
	const targetStat = await fs.stat(targetDir);

	if (!targetStat) {
		await fs.mkdir(targetDir, { recursive: true });
		return;
	}

	if (!targetStat.isDirectory()) {
		throw new Error(`Target exists and is not a directory: ${targetDir}`);
	}

	const files = await fs.readDirectory(targetDir);
	if (files.length > 0 && !force) {
		throw new Error(`Target directory is not empty: ${targetDir}`);
	}
}

async function writeStarter(
	options: CreateOptions,
	targetDir: string,
	fs: ProgramFileSystem,
): Promise<void> {
	const files = await starterFiles(options, fs);

	await Promise.all(
		files.map(async (file) => {
			const path = resolve(targetDir, file.path);
			await fs.mkdir(dirname(path), { recursive: true });
			await fs.writeFile(path, file.contents);
		}),
	);
}

async function starterFiles(options: CreateOptions, fs: ProgramFileSystem): Promise<StarterFile[]> {
	const directories = [
		new URL('common/', TEMPLATE_ROOT),
		new URL(`formats/${options.format}/`, TEMPLATE_ROOT),
		...starterTemplateDirectories(options.starter),
	];
	const files = (
		await Promise.all(directories.map((directory) => readTemplateDirectory(directory, fs)))
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

async function readTemplateDirectory(
	directory: URL,
	fs: ProgramFileSystem,
	pathPrefix = '',
): Promise<StarterFile[]> {
	const entries = await fs.readDirectory(directory);
	const files = await Promise.all(
		entries.map(async (entry) => {
			const path = `${pathPrefix}${entry.name}`;
			const url = new URL(
				entry.kind === 'directory' ? `${entry.name}/` : entry.name,
				directory,
			);

			if (entry.kind === 'directory') return readTemplateDirectory(url, fs, `${path}/`);
			if (entry.kind !== 'file') return [];

			return [{ path, contents: await fs.readFile(url) }];
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
	if (!runtime.spawn) {
		throw new Error(`Cannot run ${command}: current runtime does not provide command spawn.`);
	}

	const result = runtime.spawn(command, [...args], { cwd, stdio: 'inherit' });

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
  --format <name>   node, deno, or bun
  --starter <name>  minimal, app, docs, or full-stack
  --no-install      Skip dependency installation
  --no-git          Skip git initialization
  --force           Write into a non-empty directory
`;
}

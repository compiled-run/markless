import { basename, dirname, normalize, resolve } from 'pathe';
import { withoutTrailingSlash } from 'ufo';
import {
	AGENT_NOTE_COPY,
	AGENT_REGISTRY,
	ALL_WRITABLE_AGENTS,
	addAgentSkills,
	agentChoices,
	detectDrivingAgent,
	displaySkillPath,
	findInstalledAgents,
	parseAgentList,
	removeAgentSkills,
	type AgentId,
	type AgentWriteResult,
	type WritableAgentId,
} from './agents.ts';
import {
	addWorkspaceMember,
	detectEnclosingWorkspace,
	installManagerFor,
	joinsWorkspace,
	planInstall,
	workspaceJoinNote,
	type EnclosingWorkspace,
} from './workspace.ts';

export type { EnclosingWorkspace, InstallPlan, ManagerFlavor, PreparedFile } from './workspace.ts';
export {
	addWorkspaceMember,
	detectEnclosingWorkspace,
	installManagerFor,
	joinsWorkspace,
	planInstall,
} from './workspace.ts';

declare const __VERSION__: string | undefined;

export type ProjectFormat = 'node' | 'bun' | 'deno';
export type Starter = 'minimal' | 'app' | 'docs' | 'full-stack';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'deno';

export type Choice<T extends string> = {
	readonly value: T;
	readonly label: string;
	readonly hint: string;
	readonly disabled?: boolean;
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
		label: 'Learn Markless',
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
	readonly kind: 'directory' | 'file' | 'symlink' | 'other';
}

export interface ProgramFileStat {
	isDirectory(): boolean;
	isFile(): boolean;
}

export interface ProgramFileSystem {
	atomicCreateFile(path: ProgramPath, contents: string): Promise<boolean>;
	atomicWriteFile(path: ProgramPath, contents: string): Promise<void>;
	lstat(path: ProgramPath): Promise<ProgramFileStat | null>;
	mkdir(path: ProgramPath, options?: { readonly recursive?: boolean }): Promise<void>;
	readDirectory(path: ProgramPath): Promise<ReadonlyArray<ProgramDirectoryEntry>>;
	readFile(path: ProgramPath): Promise<string>;
	stat(path: ProgramPath): Promise<ProgramFileStat | null>;
	remove(
		path: ProgramPath,
		options?: { readonly force?: boolean; readonly recursive?: boolean },
	): Promise<void>;
	rmdir(path: ProgramPath): Promise<void>;
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

export interface ProgramPromptMultiselectOptions<T extends string> {
	readonly message: string;
	readonly options: readonly Choice<T>[];
	readonly initialValues: readonly T[];
	readonly required?: boolean;
}

export interface ProgramPrompts {
	intro(message: string): void;
	note(message: string, title?: string): void;
	select<T extends string>(options: ProgramPromptSelectOptions<T>): Promise<T>;
	multiselect<T extends string>(options: ProgramPromptMultiselectOptions<T>): Promise<T[]>;
	text(options: ProgramPromptTextOptions): Promise<string>;
	outro(message: string): void;
	cancel(message: string): void;
}

export interface ProgramRuntime {
	cwd(): string;
	env: Record<string, string | undefined>;
	fs: ProgramFileSystem;
	homeDir: string;
	isTTY: boolean;
	prompts?: ProgramPrompts;
	stdout?: ProgramWritable;
	stderr?: ProgramWritable;
	spawn?: (
		command: string,
		args: readonly string[],
		options: ProgramCommandOptions,
	) => ProgramCommandResult;
	sha256(contents: string): Promise<string>;
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
	/**
	 * `--workspace` / `--no-workspace`. Undefined when neither was passed, which
	 * is what makes a non-interactive run default to keeping the app separate.
	 * Inert when no enclosing workspace was detected.
	 */
	workspace?: boolean;
	yes: boolean;
	force: boolean;
	help: boolean;
	version: boolean;
	agents?: WritableAgentId[];
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
	agents: WritableAgentId[];
	agentDriven?: WritableAgentId;
	/**
	 * The workspace the new app would land inside, decided once in `interact`
	 * and only read from here on. Null when the app is not inside one.
	 */
	enclosingWorkspace?: EnclosingWorkspace | null;
	/**
	 * Whether the user chose to join that workspace. Undefined when they were
	 * never asked and never passed a flag, which means keeping the app separate.
	 * The enclosing config is written only when this is explicitly true.
	 */
	workspace?: boolean;
}

type StarterFile = {
	readonly path: string;
	readonly contents: string;
};

const DEFAULT_TARGET = 'my-markless-app';
const TEMPLATE_ROOT = new URL('../templates/', import.meta.url);

export class CreateProgram {
	configure(): CreateProgramConfig {
		return {
			name: 'create-markless',
			version: typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0',
			description: 'Create Markless apps',
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
			const driving = input.agents === undefined ? detectDrivingAgent(runtime) : undefined;
			const agentDriven = driving && driving !== 'cursor' ? driving : undefined;
			if (driving === 'cursor') writeCursorUnavailable(runtime);
			const target = input.target!;
			const format = input.format ?? 'node';
			return {
				target,
				format,
				starter: input.starter ?? 'minimal',
				install: input.install ?? true,
				git: input.git ?? true,
				force: input.force,
				packageManager: input.packageManager,
				cwd: input.cwd,
				agents: input.agents ?? (agentDriven ? [agentDriven] : []),
				agentDriven,
				// A run that cannot ask defaults to keeping the app separate,
				// and says so before installing. `--workspace` is the only way
				// such a run joins.
				enclosingWorkspace: await findEnclosingWorkspace(
					{ cwd: input.cwd, format, packageManager: input.packageManager, target },
					runtime,
				),
				workspace: input.workspace,
			};
		}

		if (!runtime.prompts) {
			throw new Error(
				'Interactive create prompts require the current runtime to provide prompts.',
			);
		}

		const prompts = runtime.prompts;
		prompts.intro('Welcome to Markless');
		prompts.note(
			'Choose a starting point, and Markless will set up the routes, scripts, and defaults.',
			"Let's build you an app.",
		);
		const starter =
			input.starter ??
			(await prompts.select<Starter>({
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
			(await prompts.select<ProjectFormat>({
				initialValue: 'node',
				message: 'Where should it run?',
				options: PROJECT_FORMAT_CHOICES,
			}));
		// Detected here rather than right after the target prompt because the
		// format decides which manager actually installs, and that decides
		// which workspace flavor is even relevant.
		const enclosingWorkspace = await findEnclosingWorkspace(
			{ cwd: input.cwd, format, packageManager: input.packageManager, target },
			runtime,
		);
		const workspace = await chooseWorkspace(
			{ chosen: input.workspace, enclosing: enclosingWorkspace, target },
			prompts,
		);
		const agents = input.agents ?? (await promptForAgents(runtime, prompts));
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
			agents,
			enclosingWorkspace,
			workspace,
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

		// Written whether or not dependencies are installed now: joining the
		// workspace is the user's decision about where the app lives, not about
		// when it installs.
		const enclosing = options.enclosingWorkspace;
		if (enclosing && joinsWorkspace({ enclosing, workspace: options.workspace })) {
			await joinEnclosingWorkspace(enclosing, runtime);
		}

		if (options.install) {
			await installDependencies(options, targetDir, runtime);
		}

		const agentResults = await addAgentSkills(options.agents, runtime);
		writeAgentResults(agentResults, runtime, options.agentDriven);

		if (runtime.prompts) {
			runtime.prompts.note(nextSteps(options), `Created ${options.target}`);
			runtime.prompts.outro('Markless app ready.');
			return;
		}

		runtime.stdout?.write(`Created ${options.target}\n\n${nextSteps(options)}\n`);
	}

	async run(args: readonly string[], runtime: ProgramRuntime): Promise<void> {
		if (args[0] === 'agents') {
			await this.runAgentsCommand(args.slice(1), runtime);
			return;
		}
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

	private async runAgentsCommand(
		args: readonly string[],
		runtime: ProgramRuntime,
	): Promise<void> {
		const action = args[0];
		if (action !== 'add' && action !== 'remove') {
			throw new Error('Usage: create-markless agents <add|remove> [--agents <list|none>]');
		}
		const explicit = parseAgentsOption(args.slice(1));
		let agents: WritableAgentId[];
		let agentDriven: WritableAgentId | undefined;
		if (action === 'remove') {
			agents = explicit ?? ALL_WRITABLE_AGENTS;
		} else if (explicit !== undefined) {
			agents = explicit;
		} else if (runtime.isTTY) {
			if (!runtime.prompts) throw new Error('Interactive agent prompts require prompts.');
			agents = await promptForAgents(runtime, runtime.prompts);
		} else {
			const driving = detectDrivingAgent(runtime);
			if (driving === 'cursor') writeCursorUnavailable(runtime);
			agentDriven = driving && driving !== 'cursor' ? driving : undefined;
			agents = agentDriven ? [agentDriven] : [];
		}

		const results =
			action === 'add'
				? await addAgentSkills(agents, runtime)
				: await removeAgentSkills(agents, runtime);
		writeAgentResults(results, runtime, agentDriven);
		if (results.some((result) => result.status === 'collision')) {
			throw new Error('Agent configuration finished with one or more collisions.');
		}
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
		// Inert when there is no enclosing workspace to join or stay out of.
		if (arg === '--workspace') {
			parsed.workspace = true;
			continue;
		}
		if (arg === '--no-workspace') {
			parsed.workspace = false;
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
		if (arg === '--agents' || arg.startsWith('--agents=')) {
			if (parsed.agents !== undefined) {
				throw new Error('The --agents option may only be provided once.');
			}
			const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++index];
			if (!value) throw new Error('Missing value for --agents.');
			parsed.agents = parseAgentList(value);
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

function parseAgentsOption(args: readonly string[]): WritableAgentId[] | undefined {
	if (args.length === 0) return undefined;
	let agents: WritableAgentId[] | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index]!;
		if (arg !== '--agents' && !arg.startsWith('--agents='))
			throw new Error(`Unknown option: ${arg}`);
		if (agents !== undefined) throw new Error('The --agents option may only be provided once.');
		const value = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : args[++index];
		if (!value) throw new Error('Missing value for --agents.');
		agents = parseAgentList(value);
	}
	return agents;
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

async function promptForAgents(
	runtime: ProgramRuntime,
	prompts: ProgramPrompts,
): Promise<WritableAgentId[]> {
	const found = await findInstalledAgents(runtime);
	if (found.length === 0) {
		runtime.stdout?.write(
			'○  No coding agents found on this machine — skipping agent setup.\n   (Add one later with: npx markless agents add)\n',
		);
		return [];
	}

	const foundLabels = AGENT_REGISTRY.filter((agent) => found.includes(agent.id)).map(
		(agent) => agent.label,
	);
	prompts.note(
		`Found on this machine: ${foundLabels.join(', ')}\n\n${AGENT_NOTE_COPY}`,
		'Coding agents',
	);
	const selected = await prompts.multiselect<AgentId>({
		message: 'Add Markless to your agents?',
		options: agentChoices(found),
		initialValues: found.filter((agent): agent is WritableAgentId => agent !== 'cursor'),
		required: false,
	});
	return selected.filter((agent): agent is WritableAgentId => agent !== 'cursor');
}

function writeCursorUnavailable(runtime: ProgramRuntime): void {
	runtime.stdout?.write(
		`○  Detected Cursor running this setup — ${AGENT_REGISTRY.find((agent) => agent.id === 'cursor')!.unavailableReason}\n`,
	);
}

function writeAgentResults(
	results: readonly AgentWriteResult[],
	runtime: ProgramRuntime,
	agentDriven?: WritableAgentId,
): void {
	for (const result of results) {
		const label = AGENT_REGISTRY.find((agent) => agent.id === result.agent)!.label;
		if (agentDriven === result.agent && result.status === 'added') {
			runtime.stdout?.write(
				`◇  Detected ${label} running this setup — added Markless to its\n   config so it can debug this app for you. (${displaySkillPath(result.agent)})\n`,
			);
			continue;
		}
		if (result.status === 'collision') {
			runtime.stderr?.write(
				`Agent configuration collision at ${result.path}; left unchanged.\n`,
			);
			continue;
		}
		const messages: Record<Exclude<AgentWriteResult['status'], 'collision'>, string> = {
			added: `Added Markless to ${label}: ${result.path}`,
			updated: `Updated Markless for ${label}: ${result.path}`,
			'already-configured': `Markless is already configured for ${label}: ${result.path}`,
			removed: `Removed Markless from ${label}: ${result.path}`,
			'not-configured': `Markless is not configured for ${label}: ${result.path}`,
		};
		runtime.stdout?.write(`${messages[result.status]}\n`);
	}
}

function creationSummary(options: CreateOptions): string {
	const enclosing = options.enclosingWorkspace;

	return [
		`App:      ${options.target}`,
		`Starter:  ${choiceLabel(STARTER_CHOICES, options.starter)}`,
		`Runtime:  ${choiceLabel(PROJECT_FORMAT_CHOICES, options.format)}`,
		`Install:  ${options.install ? `Yes, with ${options.packageManager}` : 'No'}`,
		`Git:      ${options.git ? 'Yes' : 'No'}`,
		// Left out for an app that already matches a member declaration: that
		// case is silent, and there is no choice to report.
		...(enclosing && !enclosing.isMember
			? [
					`Workspace: ${
						options.workspace
							? `Joining ${enclosing.root}`
							: `Separate from ${enclosing.root}`
					}`,
				]
			: []),
	].join('\n');
}

function nextSteps(options: CreateOptions): string {
	// A deno app declares `tasks`, not `scripts`, and `deno dev` is not a
	// command. Keyed on the format because the format is what wrote deno.json.
	const devCommand =
		options.format === 'deno' ? 'deno task dev' : `${options.packageManager} dev`;

	return [
		'Next steps:',
		`  cd ${options.target}`,
		`  ${devCommand}`,
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

	const renderedFiles = renderTemplateFiles(files, {
		marklessVersion: await marklessVersionRange(fs),
		packageManager: options.packageManager,
		packageName: packageName(options.target),
	});
	return renderedFiles;
}

const CLI_MANIFEST_URL = new URL('../package.json', import.meta.url);

// Reads create-markless's own package.json version so scaffolded apps depend
// on the matching published @markless/* release (`^<version>`), never the
// monorepo-only `workspace:*` links the templates would otherwise emit.
// Versions bump in lockstep across the release set, so the cli's own version
// always names a real published range.
async function marklessVersionRange(fs: ProgramFileSystem): Promise<string> {
	const manifest = JSON.parse(await fs.readFile(CLI_MANIFEST_URL)) as { version?: unknown };

	if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
		throw new Error('create-markless package.json is missing a version.');
	}

	return `^${manifest.version}`;
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
		path: file.path === 'gitignore' ? '.gitignore' : file.path,
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

	return name || 'markless-app';
}

function inferPackageManager(env: ProgramRuntime['env']): PackageManager {
	const userAgent = env.npm_config_user_agent ?? '';

	if (userAgent.startsWith('pnpm/')) return 'pnpm';
	if (userAgent.startsWith('yarn/')) return 'yarn';
	if (userAgent.startsWith('bun/')) return 'bun';
	if (userAgent.startsWith('deno/')) return 'deno';
	return 'npm';
}

async function findEnclosingWorkspace(
	options: {
		readonly cwd: string;
		readonly format: ProjectFormat;
		readonly packageManager: PackageManager;
		readonly target: string;
	},
	runtime: ProgramRuntime,
): Promise<EnclosingWorkspace | null> {
	return await detectEnclosingWorkspace({
		env: runtime.env,
		fs: runtime.fs,
		manager: installManagerFor(options),
		targetDir: resolve(options.cwd, options.target),
	});
}

/**
 * Asks how the new app should be installed when it would land inside a
 * workspace it does not belong to. Skipped entirely when a flag already
 * answered, when there is no enclosing workspace, and when the app already
 * matches a member declaration — that last case stays silent on purpose.
 */
async function chooseWorkspace(
	options: {
		readonly chosen: boolean | undefined;
		readonly enclosing: EnclosingWorkspace | null;
		readonly target: string;
	},
	prompts: ProgramPrompts,
): Promise<boolean | undefined> {
	const enclosing = options.enclosing;
	if (options.chosen !== undefined || !enclosing || enclosing.isMember) return options.chosen;

	prompts.note(
		`Found a ${enclosing.manager} workspace at ${enclosing.root}\n` +
			`${options.target} would not be one of its members.`,
	);

	return (
		(await prompts.select({
			initialValue: 'separate',
			message: `How should ${options.target} be installed?`,
			options: [
				{
					value: 'separate',
					label: 'Keep it separate (recommended)',
					hint: `Installs only ${options.target}. ${enclosing.root} is not modified.`,
				},
				{
					value: 'join',
					label: `Add it to the ${enclosing.manager} workspace`,
					hint: `Adds "${enclosing.memberPath}" to ${basename(enclosing.configFile)} and installs at ${enclosing.root}.`,
				},
			],
		})) === 'join'
	);
}

/**
 * Writes the new app into the enclosing workspace config. The one place this
 * CLI touches a file outside the new app directory, and only ever reached from
 * an explicit `--workspace` or an explicit answer to the prompt above.
 */
async function joinEnclosingWorkspace(
	enclosing: EnclosingWorkspace,
	runtime: ProgramRuntime,
): Promise<void> {
	const contents = await runtime.fs.readFile(enclosing.configFile).catch(() => {
		throw new Error(
			`Cannot join the ${enclosing.manager} workspace at ${enclosing.root}: ${enclosing.configFile} could not be read.`,
		);
	});

	await runtime.fs.writeFile(enclosing.configFile, addWorkspaceMember({ contents, enclosing }));
	runtime.stdout?.write(workspaceJoinNote(enclosing));
}

/**
 * Installs the new app's dependencies. Exported so a real-binary test can run
 * the same command this CLI runs instead of rebuilding the arguments itself.
 */
export async function installDependencies(
	options: CreateOptions,
	targetDir: string,
	runtime: ProgramRuntime,
): Promise<void> {
	const plan = planInstall({
		enclosing: options.enclosingWorkspace,
		manager: installManagerFor(options),
		target: options.target,
		workspace: options.workspace,
	});

	if (plan.skipped) {
		// A deliberate outcome, not a failure: the files are written, git is set
		// up, and the run still finishes successfully.
		if (plan.note) runtime.stdout?.write(plan.note);
		return;
	}

	// Only ever inside the new app directory: the enclosing workspace config is
	// written by joinEnclosingWorkspace, and only when the user asked to join.
	for (const file of plan.prepareFiles) {
		await runtime.fs.writeFile(resolve(targetDir, file.path), file.contents);
	}

	if (plan.note) runtime.stdout?.write(plan.note);

	// Joining installs at the workspace root, because that is the only cwd from
	// which the manager resolves the app it now declares as a member.
	const workspaceRoot = options.enclosingWorkspace?.root;
	const cwd = plan.runIn === 'workspace-root' && workspaceRoot ? workspaceRoot : targetDir;

	runCommand(runtime, plan.command, plan.args, cwd);
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
  create-markless <target> [--yes]

Options:
  --yes, -y          Use defaults
  --format <name>   node, deno, or bun
  --starter <name>  minimal, app, docs, or full-stack
  --agents <list>   claude-code, codex, gemini-cli, github-copilot, or none
  --no-install      Skip dependency installation
  --no-git          Skip git initialization
  --workspace       Add the app to the enclosing workspace, if there is one
  --no-workspace    Keep the app separate from the enclosing workspace
  --force           Write into a non-empty directory
`;
}

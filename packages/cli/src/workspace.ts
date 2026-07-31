import {
	applyEdits,
	findNodeAtLocation,
	modify,
	parse as parseJsonc,
	parseTree,
	type FormattingOptions,
	type JSONPath,
	type Node as JsoncNode,
	type ParseError,
} from 'jsonc-parser';
import { basename, dirname, join, relative, resolve } from 'pathe';
import picomatch from 'picomatch';
import { Scalar, isScalar, isSeq, parse as parseYaml, parseDocument } from 'yaml';
import type { PackageManager, ProgramFileSystem, ProgramRuntime, ProjectFormat } from './index.ts';

/**
 * The package-manager identity workspace detection needs. `yarn` splits in two
 * because classic (1.x) and berry (>= 2) mark their workspace root with
 * different files and need different standalone-install treatment. This stays
 * internal: the public `PackageManager` union is unchanged.
 */
export type ManagerFlavor = 'npm' | 'pnpm' | 'yarn-classic' | 'yarn-berry' | 'bun' | 'deno';

export interface EnclosingWorkspace {
	/** The manager whose install would walk up into this workspace. */
	readonly manager: PackageManager;
	readonly flavor: ManagerFlavor;
	/** Absolute path of the directory that owns the workspace. */
	readonly root: string;
	/** Absolute path of the file that declares the members of the workspace. */
	readonly configFile: string;
	/** Path of the new app relative to `root`, in posix form. */
	readonly memberPath: string;
	/** True when the new app directory already matches a member declaration. */
	readonly isMember: boolean;
	/**
	 * True when a member declaration uses a pattern construct we do not claim
	 * parity with the manager on (brace expansion, character class, extglob),
	 * or a deno entry that may be a glob. Recorded so a reader can see why
	 * `isMember` fell to its safe side rather than to its measured answer.
	 */
	readonly uncertain: boolean;
}

export interface PreparedFile {
	/** Path relative to the new app directory. */
	readonly path: string;
	readonly contents: string;
}

export interface InstallPlan {
	/** The binary to spawn. */
	readonly command: string;
	readonly args: readonly string[];
	/** Files to create inside the new app directory before the install runs. */
	readonly prepareFiles: readonly PreparedFile[];
	/** What to tell the user about the enclosing workspace, if anything. */
	readonly note: string | null;
	/**
	 * Where the install runs. Joining a workspace installs at the workspace
	 * root, because that is the only directory the manager will resolve the new
	 * member from; everything else installs in the new app directory.
	 */
	readonly runIn: 'app' | 'workspace-root';
	/**
	 * True when no install can be run at all. `note` says why. Only reachable by
	 * asking for `--no-workspace` under a manager that has no way to install a
	 * declared member on its own.
	 */
	readonly skipped: boolean;
}

/**
 * A deno-format app writes `deno.json` and no `package.json`, so an inferred
 * npm/pnpm/yarn/bun install has no manifest to work from at all. Deno owns that
 * manifest, so deno installs it.
 */
export function installManagerFor(options: {
	readonly format: ProjectFormat;
	readonly packageManager: PackageManager;
}): PackageManager {
	return options.format === 'deno' ? 'deno' : options.packageManager;
}

/**
 * Reads the yarn major version out of the same `npm_config_user_agent` string
 * the CLI already uses to infer the manager (`yarn/1.22.22`, `yarn/4.17.1`).
 * Returns undefined when the version cannot be read, so the caller can fall
 * back to looking at which marker files the enclosing tree actually has.
 */
export function yarnFlavorFromUserAgent(
	env: ProgramRuntime['env'],
): 'yarn-classic' | 'yarn-berry' | undefined {
	const match = /^yarn\/(\d+)\./.exec(env.npm_config_user_agent ?? '');
	if (!match) return undefined;
	return Number(match[1]) >= 2 ? 'yarn-berry' : 'yarn-classic';
}

/**
 * The flavors to scan for, in order. Only yarn is ambiguous, and only when its
 * version could not be read: berry is tried first because its marker
 * (`yarn.lock`) is the one that makes berry refuse to install at all.
 */
export function managerFlavors(
	manager: PackageManager,
	env: ProgramRuntime['env'],
): readonly ManagerFlavor[] {
	if (manager !== 'yarn') return [manager];
	const known = yarnFlavorFromUserAgent(env);
	return known ? [known] : ['yarn-berry', 'yarn-classic'];
}

/**
 * Finds the nearest ancestor workspace that the given manager would install
 * into, and reports whether the new app already counts as one of its members.
 */
export async function detectEnclosingWorkspace(input: {
	readonly fs: ProgramFileSystem;
	readonly env: ProgramRuntime['env'];
	readonly manager: PackageManager;
	readonly targetDir: string;
}): Promise<EnclosingWorkspace | null> {
	for (const flavor of managerFlavors(input.manager, input.env)) {
		const found = await scanAncestors(input.fs, input.targetDir, input.manager, flavor);
		if (found) return found;
	}
	return null;
}

/**
 * True when the user's answer means the new app should be written into the
 * enclosing workspace. An app that already matches a member declaration is
 * already in the workspace, so there is nothing to join and nothing to write.
 */
export function joinsWorkspace(input: {
	readonly enclosing: EnclosingWorkspace | null | undefined;
	readonly workspace: boolean | undefined;
}): boolean {
	return input.workspace === true && !!input.enclosing && !input.enclosing.isMember;
}

/**
 * Builds the install command for the new app. When the app is inside a foreign
 * workspace it may not match, the command is the one proven to keep the install
 * app-local for that manager; when the app is already a member, or there is no
 * enclosing workspace, the command is unchanged and nothing is printed. When
 * the user asked to join, the install runs at the workspace root instead.
 */
export function planInstall(input: {
	readonly manager: PackageManager;
	readonly target: string;
	readonly enclosing: EnclosingWorkspace | null | undefined;
	/**
	 * The user's explicit `--workspace` / `--no-workspace` answer, or the answer
	 * they gave the prompt. Undefined when they were never asked, which is the
	 * standalone default.
	 */
	readonly workspace?: boolean;
}): InstallPlan {
	const enclosing = input.enclosing;
	const plain = {
		command: input.manager,
		args: ['install'],
		prepareFiles: [],
		note: null,
		runIn: 'app',
		skipped: false,
	} as const satisfies InstallPlan;

	if (!enclosing) return plain;

	if (joinsWorkspace({ enclosing, workspace: input.workspace })) {
		// The app is a member of the workspace now, so the workspace root is the
		// only directory whose install resolves it.
		return { ...plain, runIn: 'workspace-root' };
	}

	if (enclosing.isMember) {
		// Silent by default: walking up and installing at the host root is the
		// correct, expected behavior for a directory the host already declares.
		if (input.workspace !== false) return plain;

		// The user overrode that. Three managers have no way at all to install a
		// declared member on its own, so the honest answer is to install nothing
		// rather than to half-install or to quietly hoist into the host.
		if (NO_STANDALONE_FLAVORS.includes(enclosing.flavor)) {
			return { ...plain, note: refusalNote(enclosing, input.target), skipped: true };
		}

		return {
			...plain,
			args: ['install', ...standaloneArgs(enclosing.flavor)],
			prepareFiles: standaloneFiles(enclosing.flavor),
			note: overriddenMemberNote(enclosing, input.target),
		};
	}

	return {
		...plain,
		args: ['install', ...standaloneArgs(enclosing.flavor)],
		prepareFiles: standaloneFiles(enclosing.flavor),
		note: standaloneNote(enclosing, input.target, input.workspace === undefined),
	};
}

/**
 * The managers that offer no way to install a directory their own workspace
 * declares as a member: bun accepts `--ignore-workspace` and hoists anyway,
 * yarn classic has no equivalent flag, and deno's isolation only applies to
 * directories the workspace does not declare.
 */
const NO_STANDALONE_FLAVORS: readonly ManagerFlavor[] = ['yarn-classic', 'bun', 'deno'];

function standaloneArgs(flavor: ManagerFlavor): readonly string[] {
	switch (flavor) {
		// The only manager that reinstalls the whole host workspace from a
		// non-member directory, and the only one with a documented opt-out.
		case 'pnpm':
			return ['--ignore-workspace'];
		case 'npm':
			return ['--workspaces=false'];
		// bun, yarn classic and deno all install app-locally already when the
		// app matches no member declaration, so they get an unchanged install.
		// bun in particular must never be handed `--ignore-workspace`: it
		// accepts the unknown flag without error and hoists to the host root
		// anyway, which would look correct and be wrong.
		default:
			return [];
	}
}

function standaloneFiles(flavor: ManagerFlavor): readonly PreparedFile[] {
	// Berry refuses to install from a directory that is inside its project but
	// not one of its workspaces. Its own usage error names the fix: an empty
	// yarn.lock in that directory makes it a separate project.
	return flavor === 'yarn-berry' ? [{ path: 'yarn.lock', contents: '' }] : [];
}

function standaloneNote(
	enclosing: EnclosingWorkspace,
	target: string,
	// Only worth suggesting to someone who was never asked. A user who typed
	// --no-workspace, or who picked "keep it separate" at the prompt, already
	// knows the other option exists.
	suggestJoining: boolean,
): string {
	return (
		`Found a ${enclosing.manager} workspace at ${enclosing.root}. ` +
		`${target} is not one of its members, so it is being installed on its own ` +
		`and ${enclosing.root} will not be changed.` +
		(suggestJoining ? ' Pass --workspace to add it to that workspace instead.' : '') +
		'\n'
	);
}

function overriddenMemberNote(enclosing: EnclosingWorkspace, target: string): string {
	return (
		`${target} is inside the ${enclosing.manager} workspace at ${enclosing.root}, ` +
		`but --no-workspace was passed, so it is being installed on its own ` +
		`and ${enclosing.root} will not be changed.\n`
	);
}

function refusalNote(enclosing: EnclosingWorkspace, target: string): string {
	return [
		'Skipped installing dependencies.',
		'',
		`${target} is inside the ${enclosing.manager} workspace at ${enclosing.root}, and ` +
			`${enclosing.manager} provides no way to install a workspace member on its own. ` +
			`Nothing was installed and ${enclosing.root} was not modified.`,
		'',
		`To install: run \`${enclosing.manager} install\` at ${enclosing.root}, ` +
			`or move ${target} outside that workspace.`,
		'',
	].join('\n');
}

/** What the CLI prints after it writes the new app into the enclosing config. */
export function workspaceJoinNote(enclosing: EnclosingWorkspace): string {
	return (
		`Added "${enclosing.memberPath}" to ${basename(enclosing.configFile)} ` +
		`and installing at ${enclosing.root}.\n`
	);
}

/**
 * Returns the enclosing workspace config with exactly one member entry added
 * for the new app, and every other byte — comments, indentation, key order,
 * quote style — left as it was. Only ever called when the user explicitly chose
 * to join; the caller owns reading and writing the file.
 */
export function addWorkspaceMember(input: {
	readonly enclosing: EnclosingWorkspace;
	readonly contents: string;
}): string {
	const { contents, enclosing } = input;

	if (enclosing.flavor === 'pnpm') return addYamlMember(contents, enclosing.memberPath);
	// Deno's workspace array holds explicit relative paths, spelled with the
	// leading `./` its own documentation and fixtures use.
	if (enclosing.flavor === 'deno') {
		return addJsonMember(contents, ['workspace'], `./${enclosing.memberPath}`);
	}
	// npm, yarn and bun all read `workspaces` from package.json, in either the
	// array form or the `{ packages: [...] }` object form.
	return addJsonMember(contents, manifestWorkspacePath(contents), enclosing.memberPath);
}

function manifestWorkspacePath(contents: string): JSONPath {
	const parsed = parseJsonOrNull(contents);
	if (isRecord(parsed) && isRecord(parsed.workspaces)) return ['workspaces', 'packages'];
	return ['workspaces'];
}

/**
 * Adds one string to a JSON or JSONC array. `jsonc-parser` reformats the lines
 * it edits, which would turn a single-line array into a multi-line one, so a
 * single-line array gets a raw insertion in its own existing style instead.
 */
function addJsonMember(contents: string, path: JSONPath, value: string): string {
	const root = parseTree(contents);
	const array = root ? findNodeAtLocation(root, path) : undefined;

	if (array?.type === 'array') {
		const source = contents.slice(array.offset, array.offset + array.length);
		if (!source.includes('\n')) {
			return applyEdits(contents, [singleLineInsertion(contents, array, value)]);
		}
	}

	return applyEdits(
		contents,
		modify(contents, [...path, -1], value, {
			formattingOptions: jsonFormatting(contents),
			isArrayInsertion: true,
		}),
	);
}

function singleLineInsertion(
	contents: string,
	array: JsoncNode,
	value: string,
): { offset: number; length: number; content: string } {
	const items = array.children ?? [];
	const last = items.at(-1);

	if (!last) {
		return { offset: array.offset + 1, length: 0, content: JSON.stringify(value) };
	}

	const previous = items.at(-2);
	// Reuse whatever separates the existing entries, so `["a", "b"]` and
	// `["a","b"]` each keep their own spelling.
	const separator = previous
		? contents.slice(previous.offset + previous.length, last.offset)
		: ', ';

	return {
		offset: last.offset + last.length,
		length: 0,
		content: `${separator}${JSON.stringify(value)}`,
	};
}

function jsonFormatting(contents: string): FormattingOptions {
	const indent = /\n([ \t]+)\S/.exec(contents)?.[1] ?? '  ';
	const usesTabs = indent.startsWith('\t');

	return {
		eol: contents.includes('\r\n') ? '\r\n' : '\n',
		insertSpaces: !usesTabs,
		tabSize: usesTabs ? 1 : indent.length,
	};
}

/**
 * pnpm's workspace file routinely carries comments and a non-default indent —
 * this repo's own has both — so the edit goes through the yaml Document API,
 * which round-trips the source, rather than a parse/stringify pass, which does
 * not.
 */
function addYamlMember(contents: string, memberPath: string): string {
	const document = parseDocument(contents);
	const packages = document.get('packages');
	const entry = new Scalar(memberPath);

	if (isSeq(packages)) {
		// Match the quote style the file already uses for its member globs.
		const existing = packages.items.find((item) => isScalar(item) && item.type);
		if (isScalar(existing)) entry.type = existing.type;
		packages.add(entry);
	} else {
		document.set('packages', document.createNode([memberPath]));
	}

	return document.toString({ indent: yamlIndent(contents), lineWidth: 0 });
}

/**
 * The width of one indent level, read off the first member entry. The yaml
 * Document API re-emits the whole file at whatever indent it is told to use, so
 * getting this wrong reflows a file it is supposed to leave alone.
 */
function yamlIndent(contents: string): number {
	return /^packages:[^\n]*\n([ \t]+)-/m.exec(contents)?.[1]?.length ?? 2;
}

async function scanAncestors(
	fs: ProgramFileSystem,
	targetDir: string,
	manager: PackageManager,
	flavor: ManagerFlavor,
): Promise<EnclosingWorkspace | null> {
	// Start above the app: the app directory does not exist yet, or holds only
	// files this CLI just wrote. Walk every ancestor to the filesystem root — a
	// directory with no manifest must NOT end the scan, because yarn berry was
	// observed walking past a project with no marker and claiming a root three
	// levels above it. The nearest ancestor that matches wins.
	let current = dirname(resolve(targetDir));

	for (;;) {
		const found = await readWorkspaceRoot(fs, current, targetDir, manager, flavor);
		if (found) return found;

		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

async function readWorkspaceRoot(
	fs: ProgramFileSystem,
	dir: string,
	targetDir: string,
	manager: PackageManager,
	flavor: ManagerFlavor,
): Promise<EnclosingWorkspace | null> {
	const memberPath = relative(dir, resolve(targetDir));

	if (flavor === 'pnpm') {
		const configFile = join(dir, 'pnpm-workspace.yaml');
		const contents = await readFileOrNull(fs, configFile);
		if (contents === null) return null;
		return globWorkspace(manager, flavor, dir, configFile, memberPath, pnpmPackages(contents));
	}

	if (flavor === 'deno') {
		for (const name of ['deno.json', 'deno.jsonc']) {
			const configFile = join(dir, name);
			const contents = await readFileOrNull(fs, configFile);
			if (contents === null) continue;
			const members = denoWorkspaceMembers(contents);
			if (!members) continue;
			const verdict = denoMembership(members, dir, resolve(targetDir));
			return {
				manager,
				flavor,
				root: dir,
				configFile,
				memberPath,
				isMember: verdict.isMember,
				uncertain: verdict.uncertain,
			};
		}
		return null;
	}

	const manifestFile = join(dir, 'package.json');

	if (flavor === 'yarn-berry') {
		// Berry's project root is the nearest ancestor holding a yarn.lock;
		// membership is still declared by that directory's package.json.
		const lockfile = await fs.stat(join(dir, 'yarn.lock'));
		if (!lockfile?.isFile()) return null;
		const manifest = await readFileOrNull(fs, manifestFile);
		return globWorkspace(
			manager,
			flavor,
			dir,
			manifestFile,
			memberPath,
			manifest === null ? [] : (manifestWorkspacePatterns(manifest) ?? []),
		);
	}

	const manifest = await readFileOrNull(fs, manifestFile);
	if (manifest === null) return null;
	const patterns = manifestWorkspacePatterns(manifest);
	if (!patterns) return null;
	return globWorkspace(manager, flavor, dir, manifestFile, memberPath, patterns);
}

function globWorkspace(
	manager: PackageManager,
	flavor: ManagerFlavor,
	root: string,
	configFile: string,
	memberPath: string,
	patterns: readonly string[],
): EnclosingWorkspace {
	const uncertain = patterns.some((pattern) => UNCERTAIN_PATTERN.test(pattern));

	return {
		manager,
		flavor,
		root,
		configFile,
		memberPath,
		// pnpm is the one manager that corrupts the host when we wrongly answer
		// "member", so a pattern we cannot claim parity on makes it fall to
		// non-member: the user is told, and the app installs on its own. For
		// every other manager staying silent is already the correct outcome, so
		// they fall to member.
		isMember: uncertain ? flavor !== 'pnpm' : matchesPatterns(patterns, memberPath),
		uncertain,
	};
}

// Brace expansion, character classes and extglobs. Nobody confirmed which
// matcher each manager uses internally, so these mark the answer uncertain
// instead of being matched byte-for-byte.
const UNCERTAIN_PATTERN = /[{[]|[+@?!]\(/;

// Any character that could make a deno workspace entry a glob rather than the
// explicit relative path deno's documentation shows.
const DENO_GLOB_CHARACTER = /[*?[\]{}]/;

function matchesPatterns(patterns: readonly string[], memberPath: string): boolean {
	// Negations subtract from earlier matches in list order, which is why this
	// walks the whole list instead of returning on the first hit.
	let matched = false;

	for (const raw of patterns) {
		const negated = raw.startsWith('!');
		const pattern = stripTrailingSlash(negated ? raw.slice(1) : raw);
		if (!pattern) continue;
		if (!picomatch.isMatch(memberPath, pattern)) continue;
		matched = !negated;
	}

	return matched;
}

function denoMembership(
	members: readonly unknown[],
	root: string,
	targetDir: string,
): { isMember: boolean; uncertain: boolean } {
	for (const entry of members) {
		if (typeof entry !== 'string') continue;
		// Deno's own glob resolution inside `workspace` was never positively
		// confirmed. "Member" is the silent, no-write answer and deno never
		// corrupts the host either way, so a possible glob is treated as
		// covering the app rather than guessing it does not.
		if (DENO_GLOB_CHARACTER.test(entry)) return { isMember: true, uncertain: true };
		if (resolve(root, entry) === targetDir) return { isMember: true, uncertain: false };
	}

	return { isMember: false, uncertain: false };
}

function pnpmPackages(contents: string): readonly string[] {
	// The file existing is what makes the directory a pnpm workspace root, so a
	// file we cannot read still counts as a root — with no members.
	const parsed = parseYamlOrNull(contents);
	if (!isRecord(parsed)) return [];
	return stringList(parsed.packages);
}

/**
 * Reads the `workspaces` declaration out of a package.json. Returns undefined
 * when the key is absent, which is what makes the directory not a workspace
 * root for npm, yarn and bun.
 */
function manifestWorkspacePatterns(contents: string): readonly string[] | undefined {
	const parsed = parseJsonOrNull(contents);
	if (!isRecord(parsed) || !('workspaces' in parsed)) return undefined;

	const workspaces = parsed.workspaces;
	// npm and yarn classic both accept the object form alongside the array.
	// `nohoist` is not a membership declaration and is ignored.
	if (isRecord(workspaces)) return stringList(workspaces.packages);
	return stringList(workspaces);
}

function denoWorkspaceMembers(contents: string): readonly unknown[] | undefined {
	const parsed = parseJsoncOrNull(contents);
	if (!isRecord(parsed)) return undefined;
	return Array.isArray(parsed.workspace) ? parsed.workspace : undefined;
}

async function readFileOrNull(fs: ProgramFileSystem, path: string): Promise<string | null> {
	try {
		return await fs.readFile(path);
	} catch {
		return null;
	}
}

function parseYamlOrNull(contents: string): unknown {
	try {
		return parseYaml(contents) as unknown;
	} catch {
		return null;
	}
}

function parseJsonOrNull(contents: string): unknown {
	try {
		return JSON.parse(contents) as unknown;
	} catch {
		return null;
	}
}

/**
 * Deno accepts `deno.jsonc`, and a config carrying `//` comments and trailing
 * commas is still recognized as a workspace root, so both spellings have to be
 * readable here.
 */
function parseJsoncOrNull(contents: string): unknown {
	const errors: ParseError[] = [];
	const parsed = parseJsonc(contents, errors, { allowTrailingComma: true }) as unknown;
	return errors.length > 0 ? null : parsed;
}

function stringList(value: unknown): readonly string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripTrailingSlash(pattern: string): string {
	return pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
}

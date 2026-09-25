// A rendered fence is reused only while every file its worker read, probed or loaded still matches the disk.
import { createHash, randomBytes } from 'node:crypto';
import {
	mkdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const FORMAT = 'markless-fence-cache-1';

/** Everything one worker observed while rendering fences: file contents, existence probes, symlinks. */
export type FenceInputs = {
	readonly files: Map<string, string>;
	readonly filesAbsent: Set<string>;
	readonly isFile: Map<string, boolean>;
	readonly isDirectory: Map<string, boolean>;
	readonly realpaths: Map<string, string>;
	unrepeatable: boolean;
};

type Manifest = {
	readonly format: string;
	readonly files: readonly (readonly [string, string])[];
	readonly filesAbsent: readonly string[];
	readonly isFile: readonly (readonly [string, boolean])[];
	readonly isDirectory: readonly (readonly [string, boolean])[];
	readonly realpaths: readonly (readonly [string, string])[];
};

type Entry = { readonly format: string; readonly session: string; readonly html: string | null };

export function createFenceInputs(): FenceInputs {
	return {
		files: new Map(),
		filesAbsent: new Set(),
		isFile: new Map(),
		isDirectory: new Map(),
		realpaths: new Map(),
		unrepeatable: false,
	};
}

export function contentHash(text: string | Uint8Array): string {
	return createHash('sha256').update(text).digest('hex');
}

/** Records one file's content as it was read; a second, different read makes the session unrepeatable. */
export function recordRead(
	inputs: FenceInputs,
	path: string,
	text: string | Uint8Array | undefined,
): void {
	if (text === undefined) {
		inputs.filesAbsent.add(path);
		return;
	}
	const hash = contentHash(text);
	const held = inputs.files.get(path);
	if (held !== undefined && held !== hash) inputs.unrepeatable = true;
	inputs.files.set(path, hash);
}

export function fenceKey(code: string, fenceLanguage: string): string {
	return createHash('sha256')
		.update(FORMAT)
		.update('\0')
		.update(fenceLanguage)
		.update('\0')
		.update(code)
		.digest('hex');
}

function stat(path: string) {
	try {
		return statSync(path, { throwIfNoEntry: false });
	} catch {
		return undefined;
	}
}

function readJson<T>(path: string): T | undefined {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as T;
	} catch {
		return undefined;
	}
}

function writeAtomically(path: string, text: string): void {
	const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
	writeFileSync(temporary, text);
	renameSync(temporary, path);
}

export type FenceCache = {
	/** The cached fence HTML, null for a fence shiki left alone, undefined on a miss. */
	lookup(key: string): string | null | undefined;
	store(key: string, html: string | null, inputs: FenceInputs): void;
};

export function openFenceCache(dir: string): FenceCache {
	const entries = join(dir, 'entries');
	const sessions = join(dir, 'sessions');
	mkdirSync(entries, { recursive: true });
	mkdirSync(sessions, { recursive: true });
	const session = randomBytes(12).toString('hex');
	let writtenShape = '';
	const sessionValid = new Map<string, boolean>();
	const hashes = new Map<string, string | undefined>();

	const currentHash = (path: string): string | undefined => {
		if (!hashes.has(path)) {
			let hash: string | undefined;
			try {
				hash = contentHash(readFileSync(path));
			} catch {
				hash = undefined;
			}
			hashes.set(path, hash);
		}
		return hashes.get(path);
	};

	const stillHolds = (manifest: Manifest): boolean => {
		if (manifest.format !== FORMAT) return false;
		for (const [path, hash] of manifest.files) if (currentHash(path) !== hash) return false;
		for (const path of manifest.filesAbsent) if (currentHash(path) !== undefined) return false;
		for (const [path, found] of manifest.isFile)
			if ((stat(path)?.isFile() ?? false) !== found) return false;
		for (const [path, found] of manifest.isDirectory)
			if ((stat(path)?.isDirectory() ?? false) !== found) return false;
		for (const [path, real] of manifest.realpaths) {
			let current: string;
			try {
				current = realpathSync(path);
			} catch {
				current = path;
			}
			if (current !== real) return false;
		}
		return true;
	};

	const sessionHolds = (id: string): boolean => {
		let valid = sessionValid.get(id);
		if (valid === undefined) {
			const manifest = readJson<Manifest>(join(sessions, `${id}.json`));
			valid = manifest !== undefined && stillHolds(manifest);
			sessionValid.set(id, valid);
		}
		return valid;
	};

	return {
		lookup(key) {
			const entry = readJson<Entry>(join(entries, `${key}.json`));
			if (!entry || entry.format !== FORMAT || !sessionHolds(entry.session)) return undefined;
			return entry.html;
		},
		store(key, html, inputs) {
			if (inputs.unrepeatable) return;
			// The session manifest only grows, so it is rewritten before each entry that names it.
			const shape = `${inputs.files.size}:${inputs.filesAbsent.size}:${inputs.isFile.size}:${inputs.isDirectory.size}:${inputs.realpaths.size}`;
			if (shape !== writtenShape) {
				const manifest: Manifest = {
					format: FORMAT,
					files: [...inputs.files],
					filesAbsent: [...inputs.filesAbsent],
					isFile: [...inputs.isFile],
					isDirectory: [...inputs.isDirectory],
					realpaths: [...inputs.realpaths],
				};
				writeAtomically(join(sessions, `${session}.json`), JSON.stringify(manifest));
				writtenShape = shape;
			}
			const entry: Entry = { format: FORMAT, session, html };
			writeAtomically(join(entries, `${key}.json`), JSON.stringify(entry));
		},
	};
}

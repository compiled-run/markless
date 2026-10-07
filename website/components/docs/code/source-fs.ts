// The file system the bundler reads in the compile worker: `node:fs` for the bundler's
// own source resolves here. Paths are known up front, contents arrive as the worker
// reads them, and a synchronous read of a file not read yet is recorded as a miss.

const contents = new Map<string, string>();
const files = new Set<string>();
const folders = new Set<string>(['/']);
const misses = new Set<string>();

function missing(path: string): Error {
	return Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
		code: 'ENOENT',
	});
}

function clean(path: string | URL): string {
	const text = String(path);
	return text.startsWith('file://') ? decodeURIComponent(text.slice('file://'.length)) : text;
}

/** Declares `path` a file, with its contents when they are already read. */
export function addSourceFile(path: string, code?: string): void {
	files.add(path);
	if (code !== undefined) contents.set(path, code);
	for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1))
		folders.add(path.slice(0, at));
}

export function removeSourceFile(path: string): void {
	files.delete(path);
	contents.delete(path);
}

export function hasSourceContents(path: string): boolean {
	return contents.has(path);
}

/** Files read synchronously before their contents arrived, since the last call. */
export function takeSourceMisses(): string[] {
	const taken = [...misses];
	misses.clear();
	return taken;
}

export function existsSync(path: string | URL): boolean {
	const at = clean(path);
	return files.has(at) || folders.has(at);
}

export function statSync(path: string | URL) {
	const at = clean(path);
	if (!existsSync(at)) throw missing(at);
	return { isFile: () => files.has(at), isDirectory: () => folders.has(at) };
}

export function readFileSync(path: string | URL): string {
	const at = clean(path);
	const code = contents.get(at);
	if (code !== undefined) return code;
	if (files.has(at)) misses.add(at);
	throw missing(at);
}

export function readdirSync(): string[] {
	return [];
}

export function realpathSync(path: string | URL): string {
	return clean(path);
}

export async function readFile(path: string | URL): Promise<string> {
	return readFileSync(path);
}

export default { existsSync, statSync, readFileSync, readdirSync, realpathSync };

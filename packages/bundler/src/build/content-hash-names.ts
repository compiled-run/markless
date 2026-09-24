// Finalize rewrites code after Rolldown fixed names, so hashed names are re-derived from the shipped bytes.

export type HashCharacters = 'base64' | 'base36' | 'hex';

export type ContentHashNameOptions = {
	readonly hashCharacters?: HashCharacters | undefined;
};

export type StaleChunkName = {
	readonly fileName: string;
	readonly expected: string;
};

type Chunk = {
	readonly type: 'chunk';
	fileName: string;
	code: string;
	readonly preliminaryFileName?: string;
	readonly name?: string;
	readonly facadeModuleId?: string | null;
	readonly moduleIds?: readonly string[];
	imports?: readonly string[];
	dynamicImports?: readonly string[];
	sourcemapFileName?: string | null;
};

type Asset = {
	readonly type: 'asset';
	fileName: string;
	source: string | Uint8Array;
};

type HashedName = {
	readonly directory: string;
	readonly parts: readonly string[];
	readonly lengths: readonly number[];
};

type Scan = {
	readonly segments: readonly string[];
	readonly refs: readonly Chunk[];
};

type Plan = {
	readonly chunks: readonly Chunk[];
	readonly names: ReadonlyMap<Chunk, string>;
	readonly scans: ReadonlyMap<Chunk, Scan>;
	readonly byBasename: ReadonlyMap<string, Chunk>;
	readonly matcher: RegExp | undefined;
};

const PLACEHOLDER = /!~\{[\w$]+\}~/g;
const HAS_PLACEHOLDER = /!~\{[\w$]+\}~/;
const HASH_CHARACTER = '[A-Za-z0-9_-]';

/**
 * Renames every hashed chunk to the hash of its final bytes and rewrites every chunk, asset and
 * import list that mentions a renamed chunk. Returns the renames as old file name -> new file name.
 */
export async function renameChunksToContentHashes(
	bundle: Record<string, unknown>,
	options: ContentHashNameOptions = {},
): Promise<Map<string, string>> {
	const plan = await planContentHashNames(bundle, options);
	const renames = new Map<string, string>();
	for (const [chunk, next] of plan.names) {
		if (chunk.fileName !== next) renames.set(chunk.fileName, next);
	}
	if (renames.size === 0) return renames;

	const basenameRenames = new Map<string, string>();
	for (const [previous, next] of renames) basenameRenames.set(basename(previous), basename(next));

	for (const chunk of plan.chunks) {
		const scan = plan.scans.get(chunk)!;
		if (scan.refs.length > 0) {
			const code = joinScan(scan, (ref) => basename(plan.names.get(ref) ?? ref.fileName));
			if (code !== chunk.code) chunk.code = code;
		}
		const imports = chunk.imports?.map((name) => renames.get(name) ?? name);
		if (imports && imports.some((name, index) => name !== chunk.imports![index]))
			chunk.imports = imports;
		const dynamicImports = chunk.dynamicImports?.map((name) => renames.get(name) ?? name);
		if (
			dynamicImports &&
			dynamicImports.some((name, index) => name !== chunk.dynamicImports![index])
		)
			chunk.dynamicImports = dynamicImports;
	}

	const assets = Object.values(bundle).filter(isAsset);
	for (const chunk of plan.chunks) {
		const next = plan.names.get(chunk);
		if (!next || next === chunk.fileName) continue;
		const map = assets.find((asset) => asset.fileName === `${chunk.fileName}.map`);
		if (map) {
			map.fileName = `${next}.map`;
			chunk.sourcemapFileName = map.fileName;
		}
		chunk.fileName = next;
	}
	for (const asset of assets) {
		if (typeof asset.source !== 'string' || !plan.matcher) continue;
		const source = asset.source.replace(
			plan.matcher,
			(match) => basenameRenames.get(match) ?? match,
		);
		if (source !== asset.source) asset.source = source;
	}
	return renames;
}

/** Lists hashed chunks whose file name is not the hash of their final bytes. */
export async function staleContentHashNames(
	bundle: Record<string, unknown>,
	options: ContentHashNameOptions = {},
): Promise<StaleChunkName[]> {
	const plan = await planContentHashNames(bundle, options);
	const stale: StaleChunkName[] = [];
	for (const [chunk, expected] of plan.names) {
		if (chunk.fileName !== expected) stale.push({ fileName: chunk.fileName, expected });
	}
	return stale.sort((a, b) => compare(a.fileName, b.fileName));
}

async function planContentHashNames(
	bundle: Record<string, unknown>,
	options: ContentHashNameOptions,
): Promise<Plan> {
	const chunks = Object.values(bundle)
		.filter(isChunk)
		.sort((a, b) => compare(identity(a), identity(b)) || compare(a.fileName, b.fileName));
	const hashed = new Map<Chunk, HashedName>();
	for (const chunk of chunks) {
		const name = hashedName(chunk);
		if (name) hashed.set(chunk, name);
	}
	const byBasename = new Map<string, Chunk>();
	for (const chunk of hashed.keys()) byBasename.set(basename(chunk.fileName), chunk);
	const matcher = basenameMatcher(hashed.values());

	const scans = new Map<Chunk, Scan>();
	for (const chunk of chunks) scans.set(chunk, scanReferences(chunk.code, matcher, byBasename));

	const names = new Map<Chunk, string>();
	const taken = new Set(chunks.filter((chunk) => !hashed.has(chunk)).map((c) => c.fileName));
	const characters = options.hashCharacters ?? 'base64';
	for (const component of dependencyFirstComponents([...hashed.keys()], scans)) {
		const members = new Set(component);
		const local = new Map<Chunk, string>();
		for (const member of component) {
			const scan = scans.get(member)!;
			local.set(
				member,
				await digestHex(
					[
						joinScan(scan, () => '\0'),
						...scan.refs.map((ref) =>
							members.has(ref) ? '\0cycle' : (names.get(ref) ?? ref.fileName),
						),
					].join('\0'),
				),
			);
		}
		const ordered = [...component].sort(
			(a, b) =>
				compare(local.get(a)!, local.get(b)!) ||
				compare(identity(a), identity(b)) ||
				compare(a.fileName, b.fileName),
		);
		const position = new Map(ordered.map((member, index) => [member, index]));
		const unit = await digestHex(
			ordered
				.map((member) =>
					[
						local.get(member),
						...scans
							.get(member)!
							.refs.filter((ref) => members.has(ref))
							.map((ref) => position.get(ref)),
					].join(','),
				)
				.join('\0'),
		);
		for (const member of ordered) {
			let attempt = 0;
			let fileName: string;
			do {
				const hash = await digest(`${unit}\0${position.get(member)}\0${attempt++}`);
				fileName = hashedFileName(hashed.get(member)!, hash, characters);
			} while (taken.has(fileName));
			taken.add(fileName);
			names.set(member, fileName);
		}
	}
	return { chunks, names, scans, byBasename, matcher };
}

function hashedName(chunk: Chunk): HashedName | undefined {
	const preliminary = chunk.preliminaryFileName;
	if (!preliminary) return undefined;
	const slash = preliminary.lastIndexOf('/');
	const directory = preliminary.slice(0, slash + 1);
	const file = preliminary.slice(slash + 1);
	if (HAS_PLACEHOLDER.test(directory)) return undefined;
	const placeholders = [...file.matchAll(PLACEHOLDER)];
	if (placeholders.length === 0) return undefined;
	const parts: string[] = [];
	let cursor = 0;
	for (const placeholder of placeholders) {
		parts.push(file.slice(cursor, placeholder.index));
		cursor = placeholder.index + placeholder[0].length;
	}
	parts.push(file.slice(cursor));
	if (!chunk.fileName.startsWith(directory)) return undefined;
	return { directory, parts, lengths: placeholders.map((placeholder) => placeholder[0].length) };
}

function hashedFileName(name: HashedName, hash: Uint8Array, characters: HashCharacters): string {
	const encoded = encodeHash(hash, characters);
	let fileName = name.directory + name.parts[0];
	for (let index = 0; index < name.lengths.length; index++)
		fileName += encoded.slice(0, name.lengths[index]) + name.parts[index + 1];
	return fileName;
}

function basenameMatcher(names: Iterable<HashedName>): RegExp | undefined {
	const patterns = new Set<string>();
	for (const name of names) {
		let pattern = escapeRegExp(name.parts[0]!);
		for (let index = 0; index < name.lengths.length; index++)
			pattern += `${HASH_CHARACTER}{${name.lengths[index]}}${escapeRegExp(name.parts[index + 1]!)}`;
		patterns.add(pattern);
	}
	if (patterns.size === 0) return undefined;
	return new RegExp([...patterns].sort().join('|'), 'g');
}

function scanReferences(
	code: string,
	matcher: RegExp | undefined,
	byBasename: ReadonlyMap<string, Chunk>,
): Scan {
	if (!matcher) return { segments: [code], refs: [] };
	const segments: string[] = [];
	const refs: Chunk[] = [];
	let cursor = 0;
	for (const match of code.matchAll(matcher)) {
		const ref = byBasename.get(match[0]);
		if (!ref) continue;
		segments.push(code.slice(cursor, match.index));
		refs.push(ref);
		cursor = match.index + match[0].length;
	}
	segments.push(code.slice(cursor));
	return { segments, refs };
}

function joinScan(scan: Scan, name: (ref: Chunk) => string): string {
	let code = scan.segments[0]!;
	for (let index = 0; index < scan.refs.length; index++)
		code += name(scan.refs[index]!) + scan.segments[index + 1]!;
	return code;
}

// Tarjan's algorithm, iterative; components come out after every component they reference.
function dependencyFirstComponents(
	nodes: readonly Chunk[],
	scans: ReadonlyMap<Chunk, Scan>,
): Chunk[][] {
	const nodeSet = new Set(nodes);
	const edges = new Map<Chunk, Chunk[]>();
	for (const node of nodes)
		edges.set(node, [...new Set(scans.get(node)!.refs.filter((ref) => nodeSet.has(ref)))]);
	const index = new Map<Chunk, number>();
	const low = new Map<Chunk, number>();
	const onStack = new Set<Chunk>();
	const stack: Chunk[] = [];
	const components: Chunk[][] = [];
	let counter = 0;
	for (const root of nodes) {
		if (index.has(root)) continue;
		const work: [Chunk, number][] = [[root, 0]];
		index.set(root, counter);
		low.set(root, counter++);
		stack.push(root);
		onStack.add(root);
		while (work.length > 0) {
			const frame = work[work.length - 1]!;
			const [node, next] = frame;
			const targets = edges.get(node)!;
			if (next < targets.length) {
				frame[1]++;
				const target = targets[next]!;
				if (!index.has(target)) {
					index.set(target, counter);
					low.set(target, counter++);
					stack.push(target);
					onStack.add(target);
					work.push([target, 0]);
				} else if (onStack.has(target)) {
					low.set(node, Math.min(low.get(node)!, index.get(target)!));
				}
				continue;
			}
			work.pop();
			const parent = work[work.length - 1]?.[0];
			if (parent) low.set(parent, Math.min(low.get(parent)!, low.get(node)!));
			if (low.get(node) !== index.get(node)) continue;
			const component: Chunk[] = [];
			let member: Chunk;
			do {
				member = stack.pop()!;
				onStack.delete(member);
				component.push(member);
			} while (member !== node);
			components.push(component);
		}
	}
	return components;
}

async function digest(text: string): Promise<Uint8Array> {
	return new Uint8Array(
		await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
	);
}

async function digestHex(text: string): Promise<string> {
	return encodeHash(await digest(text), 'hex');
}

function encodeHash(hash: Uint8Array, characters: HashCharacters): string {
	if (characters === 'hex')
		return [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	if (characters === 'base36') {
		let value = 0n;
		for (const byte of hash) value = (value << 8n) | BigInt(byte);
		return value.toString(36);
	}
	let binary = '';
	for (const byte of hash) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function identity(chunk: Chunk): string {
	return [chunk.name ?? '', chunk.facadeModuleId ?? '', ...(chunk.moduleIds ?? [])].join('\0');
}

function basename(fileName: string): string {
	return fileName.slice(fileName.lastIndexOf('/') + 1);
}

function compare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isChunk(output: unknown): output is Chunk {
	return (
		!!output &&
		typeof output === 'object' &&
		(output as Chunk).type === 'chunk' &&
		typeof (output as Chunk).fileName === 'string' &&
		typeof (output as Chunk).code === 'string'
	);
}

function isAsset(output: unknown): output is Asset {
	return (
		!!output &&
		typeof output === 'object' &&
		(output as Asset).type === 'asset' &&
		typeof (output as Asset).fileName === 'string'
	);
}

export function staleChunkNamesMessage(stale: readonly StaleChunkName[]): string {
	return `Markless emitted chunks whose file names are not the hash of their final bytes, so browsers holding the previous deploy in an immutable cache would keep the old code under the same name:\n${stale
		.map((entry) => `- ${entry.fileName} (bytes hash to ${entry.expected})`)
		.join(
			'\n',
		)}\nA plugin rewrote chunk code after the Markless finalize pass renamed chunks. markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`;
}

// Chunks name each other through stable specifiers; the document's import map carries the hashed names.
export const MARKLESS_IMPORT_MAP_ASSET = '.vite/markless-import-map.json';
export const MARKLESS_CHUNK_SPECIFIER_PREFIX = '@markless/c/';
const SPECIFIER_KEY_LENGTH = 8;
const PATH_CHARACTER = /[\w\-./~%@+]/;

export type ChunkImportMapOptions = {
	readonly publicPath: (fileName: string) => string;
	readonly root?: string | undefined;
};

export type ChunkSpecifiers = {
	/** Returns `{ imports }` for the chunks' current (final) file names. */
	importMap(): { readonly imports: Record<string, string> };
};

/**
 * Rewrites every quoted reference to another hashed chunk (`./chunk-x.js`, `/base/build/chunk-x.js`)
 * into a stable bare specifier, so a chunk's bytes stop depending on the names of the chunks it loads.
 * References in any other shape keep the file name and stay covered by the content-hash rename.
 */
export async function specifyChunkReferences(
	bundle: Record<string, unknown>,
	options: ChunkImportMapOptions,
): Promise<ChunkSpecifiers> {
	const chunks = Object.values(bundle)
		.filter(isChunk)
		.sort((a, b) => compare(a.fileName, b.fileName));
	const hashed = new Map<Chunk, HashedName>();
	for (const chunk of chunks) {
		const name = hashedName(chunk);
		if (name) hashed.set(chunk, name);
	}
	const byBasename = new Map<string, Chunk>();
	for (const chunk of hashed.keys()) byBasename.set(basename(chunk.fileName), chunk);
	const matcher = basenameMatcher(hashed.values());
	const keys = await specifierKeys([...hashed.keys()], options.root);
	const specified = new Set<Chunk>();
	if (matcher) {
		for (const chunk of chunks) {
			let code = '';
			let cursor = 0;
			for (const match of chunk.code.matchAll(matcher)) {
				const target = byBasename.get(match[0]);
				if (!target) continue;
				const span = quotedReference(chunk, target, match.index, match[0].length, options);
				if (!span || span.start < cursor) continue;
				code += chunk.code.slice(cursor, span.start) + keys.get(target)!;
				cursor = span.end;
				specified.add(target);
			}
			if (cursor > 0) chunk.code = code + chunk.code.slice(cursor);
		}
	}
	return {
		importMap() {
			const imports: Record<string, string> = {};
			for (const chunk of [...specified].sort((a, b) => compare(keys.get(a)!, keys.get(b)!)))
				imports[keys.get(chunk)!] = options.publicPath(chunk.fileName);
			return { imports };
		},
	};
}

// The quoted path must resolve to the target from the importing chunk, so strings that merely contain a name stay put.
function quotedReference(
	importer: Chunk,
	target: Chunk,
	index: number,
	length: number,
	options: ChunkImportMapOptions,
): { start: number; end: number } | undefined {
	const code = importer.code;
	let start = index;
	while (start > 0 && PATH_CHARACTER.test(code[start - 1]!)) start--;
	const end = index + length;
	const quote = code[start - 1];
	if (quote !== '"' && quote !== "'" && quote !== '`') return undefined;
	const escaped = code[start - 2] === '\\';
	const close = escaped ? `\\${quote}` : quote;
	if (!code.startsWith(close, end)) return undefined;
	const path = code.slice(start, end);
	const resolved =
		path.startsWith('./') || path.startsWith('../')
			? joinPath(importer.fileName, path)
			: path.startsWith('/')
				? path === options.publicPath(target.fileName)
					? target.fileName
					: undefined
				: undefined;
	return resolved === target.fileName ? { start, end } : undefined;
}

function joinPath(from: string, path: string): string {
	const parts = from.split('/').slice(0, -1);
	for (const part of path.split('/')) {
		if (part === '.' || part === '') continue;
		if (part === '..') parts.pop();
		else parts.push(part);
	}
	return parts.join('/');
}

// Keys follow what a chunk is (pack name, facade, then members on a tie), never the hash Rolldown gave it.
async function specifierKeys(
	chunks: readonly Chunk[],
	root: string | undefined,
): Promise<Map<Chunk, string>> {
	const portable = (id: string) =>
		root ? id.replaceAll(root, '').replaceAll(encodeURIComponent(root), '') : id;
	const identities = new Map<string, Chunk[]>();
	for (const chunk of chunks) {
		const identity = [chunk.name ?? '', portable(chunk.facadeModuleId ?? '')].join('\0');
		const group = identities.get(identity) ?? [];
		group.push(chunk);
		identities.set(identity, group);
	}
	const named: [string, Chunk][] = [];
	for (const [identity, group] of identities) {
		if (group.length === 1) {
			named.push([identity, group[0]!]);
			continue;
		}
		for (const chunk of group)
			named.push([
				[identity, ...(chunk.moduleIds ?? []).map(portable).sort()].join('\0'),
				chunk,
			]);
	}
	named.sort(([a], [b]) => compare(a, b));
	const keys = new Map<Chunk, string>();
	const taken = new Set<string>();
	for (const [identity, chunk] of named) {
		const hash = encodeHash(await digest(identity), 'base64');
		let key = hash.slice(0, SPECIFIER_KEY_LENGTH);
		for (let attempt = 1; taken.has(key); attempt++)
			key = `${hash.slice(0, SPECIFIER_KEY_LENGTH)}${attempt}`;
		taken.add(key);
		keys.set(chunk, `${MARKLESS_CHUNK_SPECIFIER_PREFIX}${key}`);
	}
	return keys;
}

export function importMapScript(importMap: { readonly imports: Record<string, string> }): string {
	return `<script type="importmap">${JSON.stringify(importMap).replaceAll('<', '\\u003c')}</script>`;
}

// The map must precede every module script and modulepreload; after <meta charset> keeps the charset in the first 1024 bytes.
export function insertImportMapScript(html: string, script: string): string {
	const head = /<head(?:\s[^>]*)?>/i.exec(html);
	if (!head) return `${script}${html}`;
	const headEnd = html.search(/<\/head>/i);
	const afterHead = head.index + head[0].length;
	const charset = /<meta\s[^>]*charset[^>]*>(?:<\/meta>)?/i.exec(html.slice(afterHead));
	const at =
		charset && (headEnd === -1 || afterHead + charset.index < headEnd)
			? afterHead + charset.index + charset[0].length
			: afterHead;
	return `${html.slice(0, at)}${script}${html.slice(at)}`;
}

/** Lists chunk specifiers the emitted import map does not resolve to an emitted chunk. */
export function unmappedChunkSpecifiers(bundle: Record<string, unknown>): string[] {
	const chunks = Object.values(bundle).filter(isChunk);
	const pattern = new RegExp(
		`(?<=["'\`])${escapeRegExp(MARKLESS_CHUNK_SPECIFIER_PREFIX)}[\\w-]+(?=\\\\?["'\`])`,
		'g',
	);
	const used = new Set<string>();
	for (const chunk of chunks)
		for (const [specifier] of chunk.code.matchAll(pattern)) used.add(specifier);
	if (used.size === 0) return [];
	const asset = Object.values(bundle).find(
		(output): output is Asset =>
			isAsset(output) && output.fileName === MARKLESS_IMPORT_MAP_ASSET,
	);
	const imports = asset
		? ((JSON.parse(String(asset.source)) as { imports?: Record<string, string> }).imports ?? {})
		: {};
	const files = new Set(chunks.map((chunk) => chunk.fileName));
	return [...used]
		.filter((specifier) => {
			const url = imports[specifier];
			return (
				!url || ![...files].some((file) => url === `/${file}` || url.endsWith(`/${file}`))
			);
		})
		.sort();
}

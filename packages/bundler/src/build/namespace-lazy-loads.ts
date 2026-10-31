// With facade chunks optimized away, Rolldown loads a grouped module by reading its namespace object from
// the pack: `import("./pack.js").then((n) => (n.init_a(), n.a_exports))`. These read that unminified shape.

export const NAMESPACE_HELPER = '__exportAll';

/** A `var a_exports = __exportAll({...})` declaration: each export name with the local or literal it reads. */
export type NamespaceObject = {
	readonly local: string;
	readonly start: number;
	readonly end: number;
	readonly entries: readonly (readonly [name: string, value: string])[];
};

/** A lazy load of one grouped module: the span to replace, and the names the load reads from the target. */
export type NamespaceLoad = {
	readonly start: number;
	readonly end: number;
	readonly init: string | undefined;
	readonly namespace: string;
};

const DECLARATION = /^var ([A-Za-z_$][\w$]*) = \/\* @__PURE__ \*\/ __exportAll\(\{/gm;
const IDENTIFIER = '[A-Za-z_$][\\w$]*';
const PURE = '(?:/\\* @__PURE__ \\*/ )?';
const CROSS_CHUNK_LOAD = new RegExp(
	`\\.then\\(\\((${IDENTIFIER})\\) => (?:\\(${PURE}\\1\\.(${IDENTIFIER})\\(\\), \\1\\.(${IDENTIFIER})\\)|\\1\\.(${IDENTIFIER}))\\)`,
	'y',
);
const SAME_CHUNK_LOAD = new RegExp(
	`Promise\\.resolve\\(\\)\\.then\\(\\(\\) => (?:\\(${PURE}(${IDENTIFIER})\\(\\), (${IDENTIFIER})\\)|(${IDENTIFIER}))\\)`,
	'g',
);

export function namespaceObjects(code: string): Map<string, NamespaceObject> {
	const found = new Map<string, NamespaceObject>();
	if (!code.includes(NAMESPACE_HELPER)) return found;
	for (const match of code.matchAll(DECLARATION)) {
		const start = match.index;
		const open = start + match[0].length;
		const close =
			code[open] === '\n' ? code.indexOf('\n});', open) + 4 : code.indexOf(' });', open) + 4;
		if (close < 4 || (code[open] !== '\n' && code.slice(open, close).includes('\n'))) continue;
		const entries = namespaceEntries(code.slice(open, close - 3));
		if (!entries) continue;
		found.set(match[1]!, {
			local: match[1]!,
			start,
			end: code[close] === '\n' ? close + 1 : close,
			entries,
		});
	}
	return found;
}

// One `name: () => value` getter, the value a binding or a constant Rolldown inlined in its place.
const ENTRY = new RegExp(
	String.raw`(?:(${IDENTIFIER})|("(?:[^"\\\n]|\\.)*")): \(\) => (${IDENTIFIER}|-?\d[\w.+-]*|"(?:[^"\\\n]|\\.)*"|true|false|null|void 0)(,\s*|\s*$)`,
	'y',
);

function namespaceEntries(body: string): [string, string][] | undefined {
	const entries: [string, string][] = [];
	ENTRY.lastIndex = 0;
	const text = body.trim();
	while (ENTRY.lastIndex < text.length) {
		const at = ENTRY.lastIndex;
		const match = ENTRY.exec(text);
		if (!match || match.index !== at) return undefined;
		entries.push([match[1] ?? (JSON.parse(match[2]!) as string), match[3]!]);
	}
	return entries;
}

/** The namespace load an `import()` expression ending at `end` opens, if it has the shape Rolldown writes. */
export function crossChunkNamespaceLoad(
	code: string,
	start: number,
	end: number,
): NamespaceLoad | undefined {
	CROSS_CHUNK_LOAD.lastIndex = end;
	const match = CROSS_CHUNK_LOAD.exec(code);
	if (!match) return undefined;
	return {
		start,
		end: CROSS_CHUNK_LOAD.lastIndex,
		init: match[2],
		namespace: (match[3] ?? match[4])!,
	};
}

/** The text of every namespace load in `code`: the `.then(...)` after an `import()`, or a same-pack load whole. */
export function namespaceLoadTexts(code: string): string[] {
	if (!code.includes('.then((')) return [];
	return [
		...[...code.matchAll(new RegExp(CROSS_CHUNK_LOAD.source, 'g'))].map((match) => match[0]),
		...[...code.matchAll(SAME_CHUNK_LOAD)].map((match) => match[0]),
	];
}

/** Every span reading like a same-pack load, whatever namespace it names. */
export function sameChunkLoadCandidates(code: string): { start: number; end: number }[] {
	if (!code.includes('Promise.resolve().then(() => ')) return [];
	return [...code.matchAll(SAME_CHUNK_LOAD)].map((match) => ({
		start: match.index,
		end: match.index + match[0].length,
	}));
}

/** Loads of a module from inside its own pack, which Rolldown writes without an `import()`. */
export function sameChunkNamespaceLoads(
	code: string,
	namespaces: ReadonlyMap<string, NamespaceObject>,
): NamespaceLoad[] {
	if (!namespaces.size || !code.includes('Promise.resolve().then(() => ')) return [];
	const loads: NamespaceLoad[] = [];
	for (const match of code.matchAll(SAME_CHUNK_LOAD)) {
		const namespace = (match[2] ?? match[3])!;
		if (!namespaces.has(namespace)) continue;
		loads.push({
			start: match.index,
			end: match.index + match[0].length,
			init: match[1],
			namespace,
		});
	}
	return loads;
}

/** The module each namespace object of a rendered chunk belongs to, read from its rendered modules. */
export function namespaceOwners(
	modules: Readonly<Record<string, { readonly code: string | null }>>,
): Record<string, string> {
	const owners: Record<string, string> = {};
	for (const [id, module] of Object.entries(modules)) {
		const code = module.code;
		if (!code?.includes(NAMESPACE_HELPER)) continue;
		for (const match of code.matchAll(DECLARATION)) owners[match[1]!] = id;
	}
	return owners;
}

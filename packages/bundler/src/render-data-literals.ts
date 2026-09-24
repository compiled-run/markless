import { parseJavaScriptModule } from '@markless/compiler';

type Node = { type: string; start: number; end: number; [key: string]: unknown };
type Site = { record: number; start: number; end: number; source: string };

type FactoredLiterals = { records: string[]; factories: string[] };

// Every compile variant of one source factors the same records; the answer is pure, so reuse it.
const factored = new Map<string, FactoredLiterals>();
const FACTORED_LIMIT = 512;

export function factorRenderDataLiterals(
	records: readonly string[],
	declarations: string,
): FactoredLiterals {
	if (records.length < 2) return { records: [...records], factories: [] };
	const key = JSON.stringify([declarations, records]);
	let result = factored.get(key);
	if (result) {
		factored.delete(key);
	} else {
		result = factorUncached(records, declarations);
		if (factored.size >= FACTORED_LIMIT) factored.delete(factored.keys().next().value!);
	}
	factored.set(key, result);
	return { records: [...result.records], factories: [...result.factories] };
}

function factorUncached(records: readonly string[], declarations: string): FactoredLiterals {
	const unchanged = { records: [...records], factories: [] as string[] };
	const reserved = new Set<string>();
	const visit = (value: unknown): void => {
		if (!value || typeof value !== 'object') return;
		if ((value as Node).type === 'Identifier') reserved.add(String((value as Node).name));
		for (const child of Object.values(value)) {
			if (Array.isArray(child)) child.forEach(visit);
			else if (child && typeof child === 'object') visit(child);
		}
	};
	const groups = new Map<string, Site[]>();
	const parsed = new Map<string, Array<Omit<Site, 'record'>>>();
	const prefix = 'const data=';
	try {
		// An escaped identifier can spell a factory name the text never shows, so only those need the tree.
		if (declarations.includes('\\')) visit(parseJavaScriptModule(declarations));
		else for (const name of declarations.match(FACTORY_NAME) ?? []) reserved.add(name);
		records.forEach((source, record) => {
			let sites = parsed.get(source);
			sites ??= scannedLiteralSites(source);
			if (!sites) {
				const ast = parseJavaScriptModule(prefix + source + ';') as unknown as {
					body: Array<{
						declarations: Array<{
							init: {
								type: string;
								properties: Array<{
									type: string;
									computed: boolean;
									key: { value: unknown };
									value: Node;
								}>;
							};
						}>;
					}>;
				};
				const literal = ast.body[0]?.declarations[0]?.init;
				sites =
					literal?.type === 'ObjectExpression'
						? literal.properties.flatMap((property) => {
								if (
									property.type !== 'Property' ||
									property.computed ||
									!['state', 'view'].includes(String(property.key.value)) ||
									!['ObjectExpression', 'ArrayExpression'].includes(
										property.value.type,
									)
								)
									return [];
								const start = property.value.start - prefix.length,
									end = property.value.end - prefix.length;
								return [{ start, end, source: source.slice(start, end) }];
							})
						: [];
				parsed.set(source, sites);
			}
			for (const site of sites) {
				let group = groups.get(site.source);
				if (!group) groups.set(site.source, (group = []));
				group.push({ ...site, record });
			}
		});
	} catch {
		return unchanged;
	}
	const replacements = new Map<number, Array<Site & { replacement: string }>>();
	const factories: string[] = [];
	const bytes = (source: string) => new TextEncoder().encode(source).length;
	let index = 0;
	for (const [literal, sites] of groups) {
		if (sites.length < 2) continue;
		let name: string;
		do {
			name = `marklessRenderLiteral${index++}`;
		} while (reserved.has(name));
		const replacement = `${name}()`,
			factory = `function ${name}(){return ${literal}}`;
		if (bytes(factory) + 1 + sites.length * bytes(replacement) >= sites.length * bytes(literal))
			continue;
		factories.push(factory);
		reserved.add(name);
		for (const site of sites) {
			let entries = replacements.get(site.record);
			if (!entries) replacements.set(site.record, (entries = []));
			entries.push({ ...site, replacement });
		}
	}
	return {
		factories,
		records: records.map((source, index) => {
			for (const site of (replacements.get(index) ?? []).sort((a, b) => b.start - a.start))
				source = source.slice(0, site.start) + site.replacement + source.slice(site.end);
			return source;
		}),
	};
}

// Only these names can collide with a factory, so the declarations need no tree.
const FACTORY_NAME = /marklessRenderLiteral\d+/g;

// Records are JSON plus bare non-finite numbers, so the top-level `state`/`view` literals are found by scanning.
// Undefined sends a record the scanner cannot read to the tree parser.
function scannedLiteralSites(source: string): Array<Omit<Site, 'record'>> | undefined {
	let cursor = skipSpace(source, 0);
	if (source[cursor] !== '{') return undefined;
	const sites: Array<Omit<Site, 'record'>> = [];
	cursor = skipSpace(source, cursor + 1);
	if (source[cursor] === '}') return skipSpace(source, cursor + 1) === source.length ? sites : undefined;
	for (;;) {
		if (source[cursor] !== '"') return undefined;
		const keyEnd = stringEnd(source, cursor);
		if (keyEnd < 0) return undefined;
		const key = JSON.parse(source.slice(cursor, keyEnd)) as string;
		cursor = skipSpace(source, keyEnd);
		if (source[cursor] !== ':') return undefined;
		const start = skipSpace(source, cursor + 1);
		const end = valueEnd(source, start);
		if (end < 0 || end === start) return undefined;
		if ((key === 'state' || key === 'view') && (source[start] === '{' || source[start] === '['))
			sites.push({ start, end, source: source.slice(start, end) });
		cursor = skipSpace(source, end);
		if (source[cursor] === ',') {
			cursor = skipSpace(source, cursor + 1);
			continue;
		}
		if (source[cursor] !== '}') return undefined;
		return skipSpace(source, cursor + 1) === source.length ? sites : undefined;
	}
}

function skipSpace(source: string, from: number): number {
	let cursor = from;
	while (cursor < source.length && JSON_SPACE.has(source[cursor]!)) cursor++;
	return cursor;
}

const JSON_SPACE = new Set([' ', '\t', '\n', '\r']);

function stringEnd(source: string, start: number): number {
	for (let cursor = start + 1; cursor < source.length; cursor++) {
		const char = source[cursor];
		if (char === '\\') cursor++;
		else if (char === '"') return cursor + 1;
	}
	return -1;
}

function valueEnd(source: string, start: number): number {
	let depth = 0;
	for (let cursor = start; cursor < source.length; cursor++) {
		const char = source[cursor]!;
		if (char === '"') {
			const end = stringEnd(source, cursor);
			if (end < 0) return -1;
			if (depth === 0) return end;
			cursor = end - 1;
		} else if (char === '{' || char === '[') depth++;
		else if (char === '}' || char === ']') {
			if (depth === 0) return cursor;
			if (--depth === 0) return cursor + 1;
		} else if (depth === 0 && (char === ',' || JSON_SPACE.has(char))) return cursor;
	}
	return depth === 0 ? source.length : -1;
}

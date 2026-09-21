import { parseJavaScriptModule } from '@markless/compiler';

type Node = { type: string; start: number; end: number; [key: string]: unknown };
type Site = { record: number; start: number; end: number; source: string };

export function factorRenderDataLiterals(
	records: readonly string[],
	declarations: string,
): {
	records: string[];
	factories: string[];
} {
	const unchanged = { records: [...records], factories: [] as string[] };
	if (records.length < 2) return unchanged;
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
		visit(parseJavaScriptModule(declarations));
		records.forEach((source, record) => {
			let sites = parsed.get(source);
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

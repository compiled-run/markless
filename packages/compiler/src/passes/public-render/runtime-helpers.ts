export type CatalogHelperImport = {
	readonly module: string;
	readonly names: ReadonlyArray<string>;
};

export function emitCatalogHelperImports(
	source: string,
	imports: ReadonlyArray<CatalogHelperImport>,
): string[] {
	const locals = new Map<string, string>();
	for (const entry of imports)
		for (const name of entry.names)
			// Aliased entries ('imported as local') are used under the LOCAL name.
			locals.set(name, name.includes(' as ') ? name.split(' as ')[1]! : name);
	const present = presentWords(source, new Set(locals.values()));
	return imports.flatMap((entry) => {
		const names = entry.names.filter((name) => {
			const local = locals.get(name)!;
			return /^\w+$/.test(local) ? present.has(local) : new RegExp(`\\b${local}\\b`).test(source);
		});
		return names.length > 0
			? [`import { ${names.join(', ')} } from '@markless/web/fns/${entry.module}';`]
			: [];
	});
}

// Which of `words` occur in `source` as whole `\w` runs: one linear scan answers every catalog name.
function presentWords(source: string, words: ReadonlySet<string>): Set<string> {
	const lengths = new Set([...words].map((word) => word.length));
	const found = new Set<string>();
	let start = -1;
	for (let index = 0; index <= source.length; index++) {
		const code = index < source.length ? source.charCodeAt(index) : 32;
		const word =
			(code >= 48 && code <= 57) ||
			(code >= 65 && code <= 90) ||
			(code >= 97 && code <= 122) ||
			code === 95;
		if (word) {
			if (start < 0) start = index;
		} else if (start >= 0) {
			if (lengths.has(index - start)) {
				const candidate = source.slice(start, index);
				if (words.has(candidate)) found.add(candidate);
			}
			start = -1;
		}
	}
	return found;
}

export const stateRuntimeImports = {
	module: 'state',
	names: [
		'marklessCloneState',
		'marklessSelectStateNodes',
		'marklessStateValue',
		'marklessSsrServeComputed',
	],
} as const satisfies CatalogHelperImport;

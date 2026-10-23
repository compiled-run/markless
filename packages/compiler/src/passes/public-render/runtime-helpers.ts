export type CatalogHelperImport = {
	readonly module: string;
	readonly names: ReadonlyArray<string>;
};

export function emitCatalogHelperImports(
	source: string,
	imports: ReadonlyArray<CatalogHelperImport>,
): string[] {
	return imports.flatMap((entry) => {
		const names = entry.names.filter((name) => referencesIdentifier(source, name));
		return names.length > 0
			? [`import { ${names.join(', ')} } from '@markless/web/fns/${entry.module}';`]
			: [];
	});
}

const WORD = /\w/;

// `\bname\b` without compiling a regex per name: indexOf, then a word-boundary check at each hit.
function referencesIdentifier(source: string, name: string): boolean {
	// Aliased entries ('imported as local') are used under the LOCAL name.
	const local = name.includes(' as ') ? name.split(' as ')[1]! : name;
	if (!/^\w+$/.test(local)) return new RegExp(`\\b${local}\\b`).test(source);
	for (let at = source.indexOf(local); at !== -1; at = source.indexOf(local, at + 1)) {
		const before = at === 0 ? '' : source[at - 1]!;
		const after = source[at + local.length] ?? '';
		if (!WORD.test(before) && !WORD.test(after)) return true;
	}
	return false;
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

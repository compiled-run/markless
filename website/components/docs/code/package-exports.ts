// Maps package specifiers to the files their package.json `exports` name.

/** The file a package export pattern maps `subpath` to, `*` patterns included. */
export function exportTarget(
	exports: Readonly<Record<string, unknown>>,
	subpath: string,
): string | undefined {
	for (const [pattern, value] of Object.entries(exports)) {
		const target =
			typeof value === 'string'
				? value
				: typeof (value as { default?: unknown } | null)?.default === 'string'
					? (value as { default: string }).default
					: undefined;
		if (!target) continue;
		const star = pattern.indexOf('*');
		if (star < 0) {
			if (pattern === subpath) return target;
			continue;
		}
		const head = pattern.slice(0, star);
		const tail = pattern.slice(star + 1);
		if (
			subpath.length >= head.length + tail.length &&
			subpath.startsWith(head) &&
			subpath.endsWith(tail)
		)
			return target.replace('*', subpath.slice(head.length, subpath.length - tail.length));
	}
	return undefined;
}

export type PackageFolder = {
	readonly name: string;
	readonly exports: Readonly<Record<string, unknown>>;
	/** The package's folder, ending in `/`. */
	readonly folder: string;
};

/** The file `specifier` names in one of `packages`, or undefined when none exports it. */
export function packageFile(
	packages: readonly PackageFolder[],
	specifier: string,
): string | undefined {
	for (const pkg of packages) {
		if (specifier !== pkg.name && !specifier.startsWith(`${pkg.name}/`)) continue;
		const target = exportTarget(pkg.exports, `.${specifier.slice(pkg.name.length)}`);
		return target ? `${pkg.folder}${target.replace(/^\.\//, '')}` : undefined;
	}
	return undefined;
}

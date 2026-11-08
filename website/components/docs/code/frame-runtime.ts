// The Markless runtime modules compiled code imports, served from the frame's own copy:
// each specifier becomes a small module that re-exports the frame's instance, so the
// result and the frame share one runtime.
import * as core from '@markless/core';
import corePackage from '../../../../packages/core/package.json' with { type: 'json' };
import { exportTarget, packageFile } from './package-exports.ts';
import { runtimePackages } from './source-packages.ts';

export { exportTarget };

type Namespace = Record<string, unknown>;
type Loader = () => Promise<Namespace>;

const PACKAGES = '../../../../packages/';
const sources: Record<string, Loader> = {
	...import.meta.glob(['../../../../packages/web/src/**/*.ts', '!**/*.test.ts']),
	...import.meta.glob([
		'../../../../packages/core/src/web/**/*.ts',
		'../../../../packages/core/src/runtime/**/*.ts',
		'!**/*.test.ts',
	]),
} as Record<string, Loader>;

const RUNTIME = '__marklessCodeRuntime';
const RUNTIME_IMPORT = '__marklessCodeRuntimeImport';
const namespaces: Map<string, Namespace> = ((globalThis as Record<string, unknown>)[RUNTIME] ??=
	new Map()) as Map<string, Namespace>;

const packages = runtimePackages(PACKAGES);

function loaderFor(specifier: string): Loader | undefined {
	// The frame imports this package statically, so an import() of it would load nothing more.
	if (specifier === corePackage.name) return () => Promise.resolve(core as Namespace);
	const file = packageFile(packages, specifier);
	return file ? sources[file] : undefined;
}

const shims = new Map<string, Promise<string>>();

/** A URL re-exporting the frame's copy of runtime module `specifier`, or undefined when it is not one. */
export function runtimeModuleUrl(
	specifier: string,
	url: (code: string) => string,
): Promise<string> | undefined {
	const known = shims.get(specifier);
	if (known) return known;
	const loader = loaderFor(specifier);
	if (!loader) return undefined;
	const shim = loader().then((namespace) => {
		namespaces.set(specifier, namespace);
		const names = Object.keys(namespace).filter((name) => name !== 'default');
		return url(
			[
				`const m = globalThis.${RUNTIME}.get(${JSON.stringify(specifier)});`,
				names.length > 0 ? `export const { ${names.join(', ')} } = m;` : '',
				'default' in namespace ? 'export default m.default;' : '',
			].join('\n'),
		);
	});
	shims.set(specifier, shim);
	return shim;
}

/**
 * An `import()` of runtime module `specifier` that outlives the run that linked it, or undefined
 * when it is not one. Compiled code caches such imports in page globals (`??=`), which a later
 * run reads after the run that set them is gone.
 */
export function runtimeImportCall(specifier: string | undefined): string | undefined {
	if (specifier === undefined || !loaderFor(specifier)) return undefined;
	return `globalThis.${RUNTIME_IMPORT}(${JSON.stringify(specifier)})`;
}

/** Answers `runtimeImportCall` expressions, with shim URLs `url` makes and never revokes. */
export function installRuntimeImport(url: (code: string) => string): void {
	(globalThis as Record<string, unknown>)[RUNTIME_IMPORT] = async (specifier: string) => {
		// Vite 8.3 wraps import() in a non-async preload arrow, so its argument must not await.
		const moduleUrl = (await runtimeModuleUrl(specifier, url))!;
		return import(/* @vite-ignore */ moduleUrl);
	};
}

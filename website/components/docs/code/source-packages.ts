// Which packages a block's imports reach: the runtime the result frame provides, and the
// packages whose source compiles with the block.
import corePackage from '../../../../packages/core/package.json' with { type: 'json' };
import iconsPackage from '../../../../packages/headless/icons/package.json' with { type: 'json' };
import uiPackage from '../../../../packages/headless/components/package.json' with { type: 'json' };
import webPackage from '../../../../packages/web/package.json' with { type: 'json' };
import type { PackageFolder } from './package-exports.ts';

const RUNTIME_PACKAGES = [corePackage.name, webPackage.name];

/** Whether the result frame provides `specifier` from its own runtime. */
export function isRuntimeSpecifier(specifier: string): boolean {
	return RUNTIME_PACKAGES.some((name) => specifier === name || specifier.startsWith(`${name}/`));
}

/** The runtime packages the result frame serves from its own copy, under `packagesFolder`. */
export function runtimePackages(packagesFolder: string): PackageFolder[] {
	return [
		{ name: webPackage.name, exports: webPackage.exports, folder: `${packagesFolder}web/` },
		{ name: corePackage.name, exports: corePackage.exports, folder: `${packagesFolder}core/` },
	];
}

/** The packages compiled from source with a block, under `packagesFolder` (the repo's `packages/`). */
export function sourcePackages(packagesFolder: string): PackageFolder[] {
	return [
		{
			name: uiPackage.name,
			exports: uiPackage.exports,
			folder: `${packagesFolder}headless/components/`,
		},
		{
			name: iconsPackage.name,
			exports: iconsPackage.exports,
			folder: `${packagesFolder}headless/icons/`,
		},
	];
}

/** Each source package's manifest, by its path under `packagesFolder`. */
export function sourcePackageManifests(packagesFolder: string): Record<string, string> {
	return {
		[`${packagesFolder}headless/components/package.json`]: JSON.stringify(uiPackage),
		[`${packagesFolder}headless/icons/package.json`]: JSON.stringify(iconsPackage),
	};
}

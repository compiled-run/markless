import type { Plugin } from 'vite';
import { rootRelativeId } from '../src/module-id.ts';
import { isReExportOnlySource } from '../src/build/undemanded-runtime.ts';

const WEB_SRC = '/packages/web/src/';
const CORE_SRC = '/packages/core/src/';
const MARKLESS_VIRTUAL_PREFIX = 'virtual:markless:';

export function executedModulesPlugin(): Plugin {
	let root: string | undefined;
	return {
		name: 'markless:test-executed-modules',
		enforce: 'pre',
		configResolved(config) {
			root = config.root;
		},
		transform(code, id) {
			const found = normalizedRuntimeModuleId(id);
			// The build respells symbol ids to their chunk URLs; every other id must not carry the checkout path.
			const normalized =
				found && !found.startsWith(`${MARKLESS_VIRTUAL_PREFIX}symbol:`)
					? rootRelativeId(found, root)
					: found;
			if (!normalized || isReExportOnlySource(code)) return null;
			return {
				code:
					`(globalThis.__marklessExecutedModules ??= new Set()).add(${JSON.stringify(normalized)});\n` +
					// Mirror into the DOM so witness boxes (no page.evaluate API) can read execution
					// state through page.content(). Test builds only; guarded for non-DOM contexts.
					`typeof document !== 'undefined' && document.documentElement && document.documentElement.setAttribute('data-markless-executed', [...globalThis.__marklessExecutedModules].sort().join(' '));\n` +
					code,
				map: null,
			};
		},
	};
}

export function normalizedRuntimeModuleId(id: string): string | null {
	const clean = id
		.replaceAll('\0', '')
		.replace(/\\/g, '/')
		.replace(/[?#].*$/, '');
	const webIndex = clean.indexOf(WEB_SRC);
	if (webIndex >= 0) return packageRelativeId('web', clean.slice(webIndex + WEB_SRC.length));
	const coreIndex = clean.indexOf(CORE_SRC);
	if (coreIndex >= 0) return packageRelativeId('core', clean.slice(coreIndex + CORE_SRC.length));
	const virtualIndex = clean.indexOf(MARKLESS_VIRTUAL_PREFIX);
	if (virtualIndex >= 0 && !clean.endsWith('.css')) return clean.slice(virtualIndex);
	return null;
}

function packageRelativeId(packageName: string, sourceRelativePath: string): string {
	return `${packageName}/${sourceRelativePath.replace(/\.[cm]?[jt]sx?$/, '')}`;
}

import type { Plugin } from 'vite';

const WEB_SRC = '/packages/web/src/';
const CORE_SRC = '/packages/core/src/';
const MARKLESS_VIRTUAL_PREFIX = 'virtual:markless:';

export function executedModulesPlugin(): Plugin {
	return {
		name: 'markless:test-executed-modules',
		enforce: 'pre',
		transform(code, id) {
			const normalized = normalizedRuntimeModuleId(id);
			if (!normalized) return null;
			return {
				code:
					`(globalThis.__marklessExecutedModules ??= new Set()).add(${JSON.stringify(normalized)});\n` +
					code,
				map: null,
			};
		},
	};
}

export function normalizedRuntimeModuleId(id: string): string | null {
	const clean = id.replace(/\0/g, '').replace(/\\/g, '/').replace(/[?#].*$/, '');
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

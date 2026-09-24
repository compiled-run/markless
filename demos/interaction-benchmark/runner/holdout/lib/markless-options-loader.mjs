// Loader half of markless-options-hook.mjs: the bundler's vite entry is served through a wrapper module.
const REAL = 'holdout-real';
export const VITE_ENTRY = /\/packages\/bundler\/(?:src\/vite\/index\.ts|dist\/vite\.js)$/;
let options = '{}';

export function initialize(data) {
	options = data.options;
}

export function wrapperSource(realUrl, forced) {
	const real = JSON.stringify(realUrl);
	return `import * as real from ${real};\nexport * from ${real};\nconst forced = ${forced};\nexport function markless(options = {}) {\n\tglobalThis.__holdoutMarklessCalls = (globalThis.__holdoutMarklessCalls ?? 0) + 1;\n\treturn real.markless({ ...options, ...forced });\n}\n`;
}

export async function load(url, context, nextLoad) {
	const parsed = new URL(url);
	if (
		parsed.protocol !== 'file:' ||
		!VITE_ENTRY.test(parsed.pathname) ||
		parsed.searchParams.has(REAL)
	)
		return nextLoad(url, context);
	parsed.searchParams.set(REAL, '1');
	return { format: 'module', shortCircuit: true, source: wrapperSource(parsed.href, options) };
}

import { renderToString, type SsrRenderable } from '@markless/web';
import { dirname, isAbsolute, resolve } from 'pathe';
import type { Plugin } from 'vite';
import type { BrowserCommand } from 'vitest/node';

// Node-side vitest plugin for SSR/resume browser tests. It rewrites
// renderSSR(Component) and renderSSRPhased(Component) marker calls in browser
// test files into a Vitest browser command RPC, and registers the command that
// renders the compiled TSRX artifact to HTML with @markless/web
// renderToString on the same Vite dev server that serves the browser's client
// modules.
//
// v1 limitations (fail loudly instead of half-working):
// - the component must be imported from a separate `.tsrx` module; local
//   components declared inside the test file are not supported.
// - props are not supported: `renderSSR(Component)` /
//   `renderSSRPhased(Component)` only.

const TEST_FILE_ID = /\.[jt]s(?:[?#].*)?$/;
const TSRX_MODULE = /\.tsrx$/;

type SsrCommandResult = { readonly html: string };

const renderSsrCommand: BrowserCommand<
	[componentModulePath: string, exportName: string],
	SsrCommandResult
> = async (context, componentModulePath, exportName) => {
	// The browser server compiles the client modules the payload links to
	// (resume module URL, symbol resolver virtual modules), so SSR must load
	// the component through the same server for those URLs to stay live.
	const vite = context.project.browser?.vite ?? context.project.vite;
	const moduleExports = (await vite.ssrLoadModule(componentModulePath)) as Record<
		string,
		SsrRenderable | undefined
	>;
	const artifact = moduleExports[exportName];
	if (!artifact) {
		throw new Error(
			`renderSSR: export "${exportName}" not found in ${componentModulePath}. ` +
				`Available exports: ${Object.keys(moduleExports).join(', ')}`,
		);
	}
	return { html: await renderToString(artifact) };
};

export function testSSR(): Plugin {
	return {
		name: 'markless:vitest-ssr-transform',
		enforce: 'pre',
		config() {
			return {
				test: {
					browser: {
						commands: { renderSSR: renderSsrCommand },
					},
				},
			} as never;
		},
		transform: {
			filter: {
				id: TEST_FILE_ID,
				code: /renderSSR(?:Phased)?/,
			},
			handler(code, id) {
				return transformRenderSsrCalls(code, id);
			},
		},
	};
}

type ImportedName = { readonly source: string; readonly exportName: string };

// Rewrites SSR marker helpers into the browser-command RPC plus either a
// client-side renderServerHTML() call or an explicit mount step for phased
// measurement. String-level v1 transform: imports and calls are matched
// textually, and anything outside the supported shape is a loud transform-time
// error.
export function transformRenderSsrCalls(
	code: string,
	id: string,
): { code: string; map: null } | null {
	const calls = [...code.matchAll(/(?<![.\w$])(renderSSR|renderSSRPhased)\s*\(([^)]*)\)/g)];
	if (calls.length === 0) return null;

	// Only files that import an SSR marker are rewritten. A file that
	// calls a marker without importing it hits the marker module's own
	// loud runtime error instead.
	const imports = collectImportedNames(code);
	const marker = imports.get('renderSSR') ?? imports.get('renderSSRPhased');
	if (!marker) return null;

	let transformed = code;
	for (const call of calls) {
		const helperName = call[1]!;
		const argument = call[2]!.trim();
		if (argument.includes(',')) {
			throw new Error(
				`${helperName}(${argument}) in ${id}: props are not supported yet. ` +
					`v1 supports ${helperName}(Component) with no extra arguments.`,
			);
		}
		if (!/^[A-Za-z_$][\w$]*$/.test(argument)) {
			throw new Error(
				`${helperName}(${argument}) in ${id}: v1 supports only a component ` +
					'identifier imported from a separate .tsrx module.',
			);
		}
		const component = imports.get(argument);
		if (!component || !TSRX_MODULE.test(component.source)) {
			throw new Error(
				`${helperName}(${argument}) in ${id}: "${argument}" must be imported ` +
					'from a separate .tsrx module. Local test-file components are not supported yet.',
			);
		}
		const componentModulePath = component.source.startsWith('.')
			? resolve(dirname(id.replace(/[?#].*$/, '')), component.source)
			: component.source;
		if (!isAbsolute(componentModulePath)) {
			throw new Error(
				`${helperName}(${argument}) in ${id}: bare-specifier component modules ` +
					`("${component.source}") are not supported yet. Use a relative import.`,
			);
		}
		const renderCall = ` const ssr = await __marklessSsrCommands.renderSSR(${JSON.stringify(componentModulePath)}, ${JSON.stringify(component.exportName)});`;
		const returnValue =
			helperName === 'renderSSRPhased'
				? ' return { html: ssr.html, mount(options) { return __marklessRenderServerHTML(ssr.html, options); } };'
				: ' return __marklessRenderServerHTML(ssr.html);';
		const replacement = '(async () => {' + renderCall + returnValue + ' })()';
		transformed = transformed.replace(call[0], replacement);
	}

	// The marker import's module also exports renderServerHTML, so both
	// injected helpers resolve without hardcoding a package name here.
	const injectedImports =
		`import { commands as __marklessSsrCommands } from 'vitest/browser';\n` +
		`import { renderServerHTML as __marklessRenderServerHTML } from ${JSON.stringify(marker.source)};\n`;
	return { code: injectedImports + transformed, map: null };
}

function collectImportedNames(code: string): Map<string, ImportedName> {
	const imported = new Map<string, ImportedName>();
	const importStatements = code.matchAll(/^[ \t]*import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/gm);
	for (const statement of importStatements) {
		const clause = statement[1]!.trim();
		const source = statement[2]!;
		const named = clause.match(/\{([^}]*)\}/);
		const defaultName = clause
			.replace(/\{[^}]*\}/, '')
			.replace(/,/, '')
			.trim();
		if (defaultName && /^[A-Za-z_$][\w$]*$/.test(defaultName)) {
			imported.set(defaultName, { source, exportName: 'default' });
		}
		for (const specifier of named?.[1]?.split(',') ?? []) {
			const [exportName, localName = exportName] = specifier
				.split(/\s+as\s+/)
				.map((part) => part.trim());
			if (exportName && localName) {
				imported.set(localName, { source, exportName });
			}
		}
	}
	return imported;
}

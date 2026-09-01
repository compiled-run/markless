import { renderToString, type RenderToStringOptions, type SsrRenderable } from '@markless/web';
import { renderToStream } from '@markless/web/render-to-stream';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, resolve } from 'pathe';
import type { Plugin } from 'vite';
import type { BrowserCommand } from 'vitest/node';
// The production island merge itself. Reached by path because @markless/router
// is not a dependency of this test-only package; emulating it here would make
// every multi-island pin a statement about the harness instead of the router.
import {
	composeMdxState,
	composeMdxView,
	renderMdxChild,
	type MdxChild,
	type MdxComponentArtifact,
	type MdxRoutePart,
} from '../../router/src/vite/runtime/mdx-route.ts';

// Node-side vitest plugin for SSR/resume browser tests. It rewrites
// renderSSR(Component), renderSSRIslands([Component, ...]),
// renderSSRPhased(Component), and renderStreamShell(Component) marker calls in
// browser test files into a Vitest browser command RPC, and registers the
// command that renders the compiled TSRX artifact with @markless/web
// renderToString or renderToStream on the same Vite dev server that serves the
// browser's client modules. It also serves the island resume module the
// multi-island page loads.
//
// v1 limitations (fail loudly instead of half-working):
// - the component must be imported from a separate `.tsrx` module; local
//   components declared inside the test file are not supported.
// - renderSSRIslands takes an inline array literal of those identifiers: the
//   transform is string-level and never sees the call's runtime value.
// - props are not supported. The optional trailing argument is limited to the
//   render options the browser fixture harness exposes.

const TEST_FILE_ID = /\.[jt]s(?:[?#].*)?$/;
const TSRX_MODULE = /\.tsrx$/;

type SsrCommandResult = { readonly html: string };
type StreamShellCommandResult = { readonly shell: string };
export type SsrFixtureRenderOptions = Pick<RenderToStringOptions, 'nonce'>;

/** One scenario root mounted as its own island on a composed test page. */
export type SsrIslandInput = {
	readonly componentModulePath: string;
	readonly exportName: string;
};

// The island discriminator the router mints per composed MDX child
// (`packages/router/src/vite/mdx.ts`, componentPart). It is written inline
// there, so there is nothing to import; the harness has to spell it to compose
// the same page shape.
function islandPrefix(index: number): string {
	return `m${index}:`;
}

// A real module id plus a query, not a bare `virtual:` id: the generated module
// then resolves its own relative imports against this directory, and the served
// URL is the same `/@fs/` form the framework's dev resume module already uses.
const ISLAND_RESUME_ANCHOR = fileURLToPath(new URL('./island-resume.ts', import.meta.url));
const ISLAND_RESUME_QUERY = 'markless-island-resume';
const ISLAND_RESUME_ID = /[?&]markless-island-resume=([\w-]+)/;

function islandResumeModuleUrl(islands: ReadonlyArray<SsrIslandInput>): string {
	const encoded = Buffer.from(
		JSON.stringify(islands.map((island) => island.componentModulePath)),
		'utf8',
	).toString('base64url');
	return `/@fs/${ISLAND_RESUME_ANCHOR.replace(/^\//, '')}?${ISLAND_RESUME_QUERY}=${encoded}`;
}

// Mirrors emitComposedMdxRoute's resume half: per-island `m<n>:`-keyed loaders
// over `?markless-symbols`, wired into the router's own loadMdxSymbol.
function islandResumeModuleSource(modulePaths: ReadonlyArray<string>): string {
	const loaders = modulePaths.map((modulePath, index) => {
		const prefix = islandPrefix(index);
		const symbolUrl = `/@fs/${modulePath.replace(/^\//, '')}?markless-symbols`;
		return (
			`{ prefix: ${JSON.stringify(prefix)}, loadSymbol(symbolId) { ` +
			`return import(${JSON.stringify(symbolUrl)}).then((mod) => mod.loadSymbol(symbolId.slice(${prefix.length}))); } }`
		);
	});
	return [
		`import { createIslandResumeContainerEvent } from './island-resume.ts';`,
		'',
		`export const resumeContainerEvent = createIslandResumeContainerEvent([${loaders.join(', ')}]);`,
		'',
	].join('\n');
}

const renderSsrCommand: BrowserCommand<
	[componentModulePath: string, exportName: string, options?: SsrFixtureRenderOptions],
	SsrCommandResult
> = async (context, componentModulePath, exportName, options) => {
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
	return { html: await renderToString(artifact, { ...options, executionLog: 'never' }) };
};

// Composes N scenario roots as SEPARATE islands on one page and merges their
// payloads through the ROUTER's composeMdxState/composeMdxView — the same call
// an MDX route with N `<Component />` children makes. The page then resumes
// once, through the virtual island resume module served below.
const renderSsrIslandsCommand: BrowserCommand<
	[islands: ReadonlyArray<SsrIslandInput>, options?: SsrFixtureRenderOptions],
	SsrCommandResult
> = async (context, islands, options) => {
	if (islands.length === 0) {
		throw new Error('renderSSRIslands([...]): at least one island component is required.');
	}
	const vite = context.project.browser?.vite ?? context.project.vite;
	const artifacts = await Promise.all(
		islands.map(async (island) => {
			const moduleExports = (await vite.ssrLoadModule(island.componentModulePath)) as Record<
				string,
				SsrRenderable | undefined
			>;
			const artifact = moduleExports[island.exportName];
			if (!artifact) {
				throw new Error(
					`renderSSRIslands: export "${island.exportName}" not found in ${island.componentModulePath}. ` +
						`Available exports: ${Object.keys(moduleExports).join(', ')}`,
				);
			}
			return artifact;
		}),
	);

	// An MDX page whose parts are nothing but its component children: one part
	// per island, in mount order, which is what fixes each island's element
	// offset in composeMdxView.
	const parts: MdxRoutePart[] = islands.map((_, componentIndex) => ({
		kind: 'component',
		componentIndex,
	}));
	const composed = {
		storageSeeds: artifacts.flatMap(
			(artifact) =>
				(typeof artifact === 'object' ? (artifact.storageSeeds ?? []) : []) as never[],
		),
		async renderSsr() {
			const children: MdxChild[] = [];
			let html = '';
			for (const [index, artifact] of artifacts.entries()) {
				html += await renderMdxChild(
					children,
					artifact as MdxComponentArtifact,
					{},
					{
						componentIndex: index,
						hostPrefix: islandPrefix(index),
						symbolPrefix: islandPrefix(index),
					},
				);
			}
			const state = composeMdxState(children);
			const view = composeMdxView(parts, children, 0);
			return { html, ...(state ? { state } : {}), ...(view ? { view } : {}) };
		},
		// The composed page is not a compiled artifact, so it carries no resume
		// module of its own; the island resume module below is its entry.
	} as unknown as SsrRenderable;

	return {
		html: await renderToString(composed, {
			...options,
			executionLog: 'never',
			resumeModuleUrl: islandResumeModuleUrl(islands),
		}),
	};
};

const renderStreamShellCommand: BrowserCommand<
	[componentModulePath: string, exportName: string, options?: SsrFixtureRenderOptions],
	StreamShellCommandResult
> = async (context, componentModulePath, exportName, options) => {
	const vite = context.project.browser?.vite ?? context.project.vite;
	const moduleExports = (await vite.ssrLoadModule(componentModulePath)) as Record<
		string,
		SsrRenderable | undefined
	>;
	const artifact = moduleExports[exportName];
	if (!artifact) {
		throw new Error(
			`renderStreamShell: export "${exportName}" not found in ${componentModulePath}. ` +
				`Available exports: ${Object.keys(moduleExports).join(', ')}`,
		);
	}
	const stream = await renderToStream(artifact, { ...options, executionLog: 'never' });
	return { shell: stream.shell };
};

// Types for the browser commands testSSR() registers above. This block lives
// inside a pack ENTRY on purpose: a standalone ambient .d.ts is not an entry and
// is dropped by the build, which is why these types never reached consumers.
// An inline `declare module` in an entry survives into the emitted .d.ts.
declare module 'vitest/browser' {
	export interface BrowserCommands {
		renderSSR(
			componentModulePath: string,
			exportName: string,
			options?: SsrFixtureRenderOptions,
		): Promise<{ readonly html: string }>;
		renderSSRIslands(
			islands: ReadonlyArray<SsrIslandInput>,
			options?: SsrFixtureRenderOptions,
		): Promise<{ readonly html: string }>;
		renderStreamShell(
			componentModulePath: string,
			exportName: string,
			options?: SsrFixtureRenderOptions,
		): Promise<{ readonly shell: string }>;
	}
}

export function testSSR(): Plugin {
	return {
		name: 'markless:vitest-ssr-transform',
		enforce: 'pre',
		config() {
			return {
				test: {
					browser: {
						commands: {
							renderSSR: renderSsrCommand,
							renderSSRIslands: renderSsrIslandsCommand,
							renderStreamShell: renderStreamShellCommand,
						},
					},
				},
			} as never;
		},
		// Claiming the id before vite:resolve means the `/@fs/` request prefix is
		// still on it; strip it here or the generated module's own relative
		// import resolves against a directory that does not exist.
		resolveId(id) {
			if (!ISLAND_RESUME_ID.test(id)) return undefined;
			return id.startsWith('/@fs/') ? id.slice('/@fs'.length) : id;
		},
		load(id) {
			const encoded = id.match(ISLAND_RESUME_ID)?.[1];
			if (!encoded) return undefined;
			return islandResumeModuleSource(
				JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as string[],
			);
		},
		transform: {
			filter: {
				id: TEST_FILE_ID,
				code: /renderSSR(?:Islands|Phased)?|renderStreamShell/,
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
	const calls = [
		...code.matchAll(
			/(?<![.\w$])(renderSSRIslands|renderSSR|renderSSRPhased|renderStreamShell)\s*\(([^)]*)\)/g,
		),
	];
	if (calls.length === 0) return null;

	// Only files that import an SSR marker are rewritten. A file that
	// calls a marker without importing it hits the marker module's own
	// loud runtime error instead.
	const imports = collectImportedNames(code);
	const marker =
		imports.get('renderSSR') ??
		imports.get('renderSSRIslands') ??
		imports.get('renderSSRPhased') ??
		imports.get('renderStreamShell');
	if (!marker) return null;

	let transformed = code;
	for (const call of calls) {
		const helperName = call[1]!;
		const argumentSource = call[2]!.trim();
		const [argument, options, ...extraArguments] = splitCallArguments(argumentSource);
		if (!argument || extraArguments.length > 0) {
			throw new Error(
				`${helperName}(${argumentSource}) in ${id}: the fixture harness supports only ` +
					'a component and optional render options.',
			);
		}
		const renderOptions = options ? `, ${options}` : '';
		let renderCall: string;
		if (helperName === 'renderSSRIslands') {
			const islands = islandArgumentComponents(argument, imports, id).map((component) =>
				JSON.stringify({
					componentModulePath: component.componentModulePath,
					exportName: component.exportName,
				}),
			);
			renderCall = ` const ssr = await __marklessSsrCommands.renderSSRIslands([${islands.join(', ')}]${renderOptions});`;
		} else {
			const component = resolveMarkerComponent(helperName, argument, imports, id);
			const commandName =
				helperName === 'renderStreamShell' ? 'renderStreamShell' : 'renderSSR';
			renderCall = ` const ssr = await __marklessSsrCommands.${commandName}(${JSON.stringify(component.componentModulePath)}, ${JSON.stringify(component.exportName)}${renderOptions});`;
		}
		const returnValue =
			helperName === 'renderSSRPhased'
				? ' return { html: ssr.html, mount(options) { return __marklessRenderServerHTML(ssr.html, options); } };'
				: helperName === 'renderStreamShell'
					? ' return ssr.shell;'
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

type ResolvedMarkerComponent = {
	readonly componentModulePath: string;
	readonly exportName: string;
};

// The one supported argument shape for the multi-island marker: an inline array
// literal of component identifiers. Anything else would need the call's runtime
// value, which this string-level transform never sees.
function islandArgumentComponents(
	argument: string,
	imports: ReadonlyMap<string, ImportedName>,
	id: string,
): ResolvedMarkerComponent[] {
	const inner = argument.match(/^\[([\s\S]*)\]$/)?.[1];
	if (inner === undefined) {
		throw new Error(
			`renderSSRIslands(${argument}) in ${id}: expects an inline array of component ` +
				'identifiers, e.g. renderSSRIslands([Island, Island]).',
		);
	}
	const entries = splitCallArguments(inner).filter((entry) => entry.length > 0);
	if (entries.length === 0) {
		throw new Error(
			`renderSSRIslands([]) in ${id}: at least one island component is required.`,
		);
	}
	return entries.map((entry) => resolveMarkerComponent('renderSSRIslands', entry, imports, id));
}

function resolveMarkerComponent(
	helperName: string,
	argument: string,
	imports: ReadonlyMap<string, ImportedName>,
	id: string,
): ResolvedMarkerComponent {
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
	return { componentModulePath, exportName: component.exportName };
}

function splitCallArguments(source: string): string[] {
	const arguments_: string[] = [];
	let start = 0;
	let depth = 0;
	let quote = '';
	for (let index = 0; index < source.length; index++) {
		const character = source[index]!;
		if (quote) {
			if (character === '\\') index++;
			else if (character === quote) quote = '';
			continue;
		}
		if (character === '"' || character === "'" || character === '`') {
			quote = character;
			continue;
		}
		if (character === '{' || character === '[' || character === '(') depth++;
		else if (character === '}' || character === ']' || character === ')') depth--;
		else if (character === ',' && depth === 0) {
			arguments_.push(source.slice(start, index).trim());
			start = index + 1;
		}
	}
	arguments_.push(source.slice(start).trim());
	return arguments_;
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

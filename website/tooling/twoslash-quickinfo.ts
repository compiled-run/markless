// Real editor types for the code fences, resolved at build time.
//
// `.tsrx` is not TypeScript, so `typescript` alone cannot answer a hover over
// one. The vendored `@markless/typescript-plugin` ships the same Volar layer the
// editor uses: `MarklessTsrxVirtualCode` compiles an authored `.tsrx` snapshot
// into generated TSX plus source mappings, and `@volar/typescript` serves that
// TSX to a plain TypeScript language service and maps positions back. Wiring the
// two here gives quick info in authored coordinates.
//
// No tsconfig is read anywhere in this file: the options below are the whole
// project, and the virtual fence file sits at the site root so bare specifiers
// resolve through the site's own `node_modules` — which is where the vendored
// `@markless/ui` source (raw `.ts`/`.tsrx`, never `.d.ts`) lives.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Volar is a dependency of the vendored plugin, not of the site, so it is
// required from the plugin's own location: the copy the plugin compiled against.
const volarRequire = createRequire(require.resolve('@markless/typescript-plugin/language'));

type VolarLanguage = {
	readonly scripts: {
		set(id: string, snapshot: ts.IScriptSnapshot): unknown;
		delete(id: string): void;
	};
};

type VolarCore = {
	createLanguage(
		plugins: readonly unknown[],
		scriptRegistry: Map<string, unknown>,
		sync: (id: string, includeFsFiles: boolean, shouldRegister: boolean) => void,
	): VolarLanguage;
	FileMap: new (caseSensitive: boolean) => Map<string, unknown>;
};

type VolarTypeScript = {
	decorateLanguageServiceHost(
		tsModule: typeof ts,
		language: VolarLanguage,
		host: ts.LanguageServiceHost,
	): void;
	createProxyLanguageService(service: ts.LanguageService): {
		proxy: ts.LanguageService;
		initialize(language: VolarLanguage): void;
	};
	resolveFileLanguageId(path: string): string | undefined;
};

type TsrxVirtualCode = { update(snapshot: ts.IScriptSnapshot): void };

type MarklessLanguage = {
	MARKLESS_TSRX_LANGUAGE_ID: string;
	isMarklessTsrxFile(fileName: string): boolean;
	MarklessTsrxVirtualCode: new (
		fileName: string,
		snapshot: ts.IScriptSnapshot,
	) => TsrxVirtualCode;
};

/** One resolved hover, in offsets into the fence source the caller passed in. */
export type QuickInfo = {
	readonly start: number;
	readonly length: number;
	/** The signature line an editor shows in bold, e.g. `(alias) function root(...): Element`. */
	readonly signature: string;
	/** The symbol's doc comment on one line, or empty when it has none. */
	readonly doc: string;
};

export type QuickInfoService = {
	/** Every identifier in one fence that resolves to a type. Unknown languages give none. */
	queryFence(code: string, language: string): readonly QuickInfo[];
};

const SITE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Fence language -> the extension its virtual file gets. Anything else is skipped. */
const FENCE_EXTENSION: Readonly<Record<string, string>> = { tsrx: '.tsrx' };

/** Whether a fence of this language has types to ask for, before paying for the program. */
export function hasQuickInfo(language: string): boolean {
	return language in FENCE_EXTENSION;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
	allowImportingTsExtensions: true,
	// `.tsrx` is none of TypeScript's own extensions, so without this the program
	// drops the fence file, and every family `.tsrx` it imports, before Volar is asked.
	allowNonTsExtensions: true,
	jsx: ts.JsxEmit.Preserve,
	lib: ['lib.es2023.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	noEmit: true,
	skipLibCheck: true,
	strict: true,
	target: ts.ScriptTarget.ES2023,
	types: [],
};

const SCRIPT_KINDS: Readonly<Record<string, ts.ScriptKind>> = {
	'.js': ts.ScriptKind.JS,
	'.json': ts.ScriptKind.JSON,
	'.jsx': ts.ScriptKind.JSX,
	'.mjs': ts.ScriptKind.JS,
	'.ts': ts.ScriptKind.TS,
	'.tsx': ts.ScriptKind.TSX,
};

/** Identifier runs are the only positions worth asking the checker about. */
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;

/** The generated TSX names its element type inside a namespace no reader should meet. */
const INTERNAL_NAMESPACE = /\b__MarklessTypeService\./g;

function extensionOf(fileName: string): string {
	const at = fileName.lastIndexOf('.');
	return at < 0 ? '' : fileName.slice(at);
}

function displayPartsToString(parts: readonly ts.SymbolDisplayPart[] | undefined): string {
	return (parts ?? []).map((part) => part.text).join('');
}

/** One line, the way a tooltip shows it. Quick info puts the signature on the first. */
function signatureLine(parts: readonly ts.SymbolDisplayPart[] | undefined): string {
	return displayPartsToString(parts)
		.split('\n', 1)[0]
		.replace(INTERNAL_NAMESPACE, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function flatten(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function marklessLanguagePlugin(): unknown {
	const language = require('@markless/typescript-plugin/language') as MarklessLanguage;
	return {
		getLanguageId(scriptId: string): string | undefined {
			return language.isMarklessTsrxFile(scriptId)
				? language.MARKLESS_TSRX_LANGUAGE_ID
				: undefined;
		},
		createVirtualCode(
			scriptId: string,
			languageId: string,
			snapshot: ts.IScriptSnapshot,
		): TsrxVirtualCode | undefined {
			if (languageId !== language.MARKLESS_TSRX_LANGUAGE_ID) return undefined;
			return new language.MarklessTsrxVirtualCode(scriptId, snapshot);
		},
		updateVirtualCode(
			_scriptId: string,
			virtualCode: TsrxVirtualCode,
			snapshot: ts.IScriptSnapshot,
		): TsrxVirtualCode {
			virtualCode.update(snapshot);
			return virtualCode;
		},
		typescript: {
			extraFileExtensions: [
				{ extension: 'tsrx', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred },
			],
			// `preventLeadingOffset` is left off on purpose: the plugin's mapping
			// helpers assume Volar serves the generated TSX behind a blanked copy of
			// the authored source, and opting out would shift every mapped position.
			getServiceScript(root: unknown) {
				return { code: root, extension: '.tsx', scriptKind: ts.ScriptKind.TSX };
			},
		},
	};
}

type FenceFile = { readonly fileName: string; text: string; version: number };

function createService(): {
	readonly proxy: ts.LanguageService;
	readonly files: ReadonlyMap<string, FenceFile>;
} {
	const core = volarRequire('@volar/language-core') as VolarCore;
	const volarTs = volarRequire('@volar/typescript') as VolarTypeScript;

	const files = new Map<string, FenceFile>();
	for (const extension of new Set(Object.values(FENCE_EXTENSION)))
		files.set(extension, {
			fileName: join(SITE_ROOT, `__twoslash_fence__${extension}`),
			text: '',
			version: 0,
		});

	const fenceByName = new Map([...files.values()].map((file) => [file.fileName, file] as const));
	const diskVersions = new Map<string, string>();
	// Volar recompiles a `.tsrx` whenever the snapshot object changes identity, so
	// a version keeps its one snapshot: without this every lookup recompiles the
	// whole family tree the fence imports.
	const snapshots = new Map<string, { version: string; snapshot: ts.IScriptSnapshot }>();

	const versionOf = (fileName: string): string => {
		const fence = fenceByName.get(fileName);
		if (fence) return String(fence.version);
		let version = diskVersions.get(fileName);
		if (version === undefined) {
			version = String(ts.sys.getModifiedTime?.(fileName)?.getTime() ?? 0);
			diskVersions.set(fileName, version);
		}
		return version;
	};

	const readSnapshot = (fileName: string): ts.IScriptSnapshot | undefined => {
		const version = versionOf(fileName);
		const cached = snapshots.get(fileName);
		if (cached && cached.version === version) return cached.snapshot;
		const fence = fenceByName.get(fileName);
		const text = fence ? fence.text : ts.sys.readFile(fileName);
		if (text === undefined) return undefined;
		const snapshot = ts.ScriptSnapshot.fromString(text);
		snapshots.set(fileName, { snapshot, version });
		return snapshot;
	};

	const host: ts.LanguageServiceHost = {
		directoryExists: (path) => ts.sys.directoryExists(path),
		fileExists: (path) => fenceByName.has(path) || ts.sys.fileExists(path),
		getCompilationSettings: () => COMPILER_OPTIONS,
		getCurrentDirectory: () => SITE_ROOT,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getDirectories: (path) => ts.sys.getDirectories(path),
		getScriptFileNames: () => [...fenceByName.keys()],
		// Volar only decorates a `getScriptKind` the host already has, and without
		// one TypeScript hands the fence to the wrong parser.
		getScriptKind: (fileName) => SCRIPT_KINDS[extensionOf(fileName)] ?? ts.ScriptKind.TS,
		getScriptSnapshot: readSnapshot,
		getScriptVersion: versionOf,
		readDirectory: (path, extensions, exclude, include, depth) =>
			ts.sys.readDirectory(path, extensions, exclude, include, depth),
		readFile: (path) => ts.sys.readFile(path),
		// Volar only decorates a resolver the host already has, and its `.tsrx`
		// resolution is the whole point of this service, so a plain one is required.
		resolveModuleNameLiterals: (literals, containingFile, redirected, options, containing) =>
			literals.map((literal) =>
				ts.resolveModuleName(
					literal.text,
					containingFile,
					options,
					ts.sys,
					undefined,
					redirected,
					ts.getModeForUsageLocation(containing, literal, options),
				),
			),
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
	};

	const language: VolarLanguage = core.createLanguage(
		[marklessLanguagePlugin(), { getLanguageId: volarTs.resolveFileLanguageId }],
		new core.FileMap(ts.sys.useCaseSensitiveFileNames) as Map<string, unknown>,
		(id: string) => {
			const snapshot = readSnapshot(id);
			if (snapshot) language.scripts.set(id, snapshot);
			else language.scripts.delete(id);
		},
	);

	volarTs.decorateLanguageServiceHost(ts, language, host);
	const { proxy, initialize } = volarTs.createProxyLanguageService(
		ts.createLanguageService(host, ts.createDocumentRegistry()),
	);
	initialize(language);
	return { files, proxy };
}

let shared: ReturnType<typeof createService> | undefined;

/**
 * The build gets one language service and one cache, both keyed off the fence
 * text: a page repeats the same demo source across tabs and sections, and the
 * program is only cheap once it is warm.
 */
export function createQuickInfoService(): QuickInfoService {
	shared ??= createService();
	const { files, proxy } = shared;
	const cache = new Map<string, readonly QuickInfo[]>();

	return {
		queryFence(code: string, language: string): readonly QuickInfo[] {
			const extension = FENCE_EXTENSION[language];
			const file = extension === undefined ? undefined : files.get(extension);
			if (!file) return [];
			const key = `${extension}\0${createHash('sha256').update(code).digest('hex')}`;
			const cached = cache.get(key);
			if (cached) return cached;

			file.text = code;
			file.version += 1;

			const seen = new Set<number>();
			const found: QuickInfo[] = [];
			IDENTIFIER.lastIndex = 0;
			for (let match = IDENTIFIER.exec(code); match; match = IDENTIFIER.exec(code)) {
				let info: ts.QuickInfo | undefined;
				try {
					info = proxy.getQuickInfoAtPosition(file.fileName, match.index);
				} catch {
					// A half-typed fence leaves the checker without a symbol here; the
					// rest of the fence still answers, so one dead position is skipped.
					info = undefined;
				}
				// A module hover is the resolved file's absolute path: a build machine's
				// directory layout, which has no business in the shipped HTML.
				if (!info || info.kind === ts.ScriptElementKind.moduleElement) continue;
				const { length, start } = info.textSpan;
				if (length <= 0 || start + length > code.length || seen.has(start)) continue;
				const signature = signatureLine(info.displayParts);
				if (!signature) continue;
				seen.add(start);
				found.push({
					doc: flatten(displayPartsToString(info.documentation)),
					length,
					signature,
					start,
				});
			}
			cache.set(key, found);
			return found;
		},
	};
}

// Each fence resolves editor types at the site root through the installed Volar service.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const require = createRequire(import.meta.url);
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
	// Volar supplies the parser for the non-TypeScript extension.
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
			// Mapping offsets include Volar’s blanked authored-source prefix.
			getServiceScript(root: unknown) {
				return { code: root, extension: '.tsx', scriptKind: ts.ScriptKind.TSX };
			},
		},
	};
}

type FenceFile = { readonly fileName: string; readonly text: string; readonly version: number };

function createReusableDocumentRegistry(isFence: (path: string) => boolean): ts.DocumentRegistry {
	const registry = ts.createDocumentRegistry(ts.sys.useCaseSensitiveFileNames, SITE_ROOT);
	const released = new Map<string, () => void>();
	const keyOf = (
		path: string,
		key: string,
		kind: ts.ScriptKind | undefined,
		mode: ts.ResolutionMode,
	) => JSON.stringify([path, key, kind, mode]);
	return {
		...registry,
		acquireDocumentWithKey(...args) {
			const document = registry.acquireDocumentWithKey(...args);
			const key = keyOf(args[1], args[3], args[6], document.impliedNodeFormat);
			released.get(key)?.();
			released.delete(key);
			return document;
		},
		releaseDocumentWithKey(path, bucket, kind, mode?: ts.ResolutionMode) {
			const release = () => registry.releaseDocumentWithKey(path, bucket, kind!, mode);
			const key = keyOf(path, bucket, kind, mode);
			if (isFence(path) || released.has(key)) {
				release();
				return;
			}
			// Retain parsed imports across isolated fence programs, with bounded inactive storage.
			released.set(key, release);
			if (released.size > 512) {
				const [oldest, evict] = released.entries().next().value!;
				evict();
				released.delete(oldest);
			}
		},
	};
}

/** What the service read from disk, so a cached answer can be checked against the disk later. */
export type QuickInfoInputRecorder = {
	read(path: string, text: string | undefined): void;
	fileExists(path: string, found: boolean): void;
	directoryExists(path: string, found: boolean): void;
	realpath(path: string, real: string): void;
	/** The service asked something the recorder cannot replay, such as a directory listing. */
	unrepeatable(): void;
};

let recorder: QuickInfoInputRecorder | undefined;

export function recordQuickInfoInputs(next: QuickInfoInputRecorder | undefined): void {
	recorder = next;
}

function readRecorded(path: string): string | undefined {
	const text = ts.sys.readFile(path);
	recorder?.read(path, text);
	return text;
}

function memoize<T>(read: (path: string) => T): (path: string) => T {
	const seen = new Map<string, T>();
	return (path) => {
		if (seen.has(path)) return seen.get(path)!;
		const value = read(path);
		seen.set(path, value);
		return value;
	};
}

// Disk is treated as fixed for the service's lifetime, as the snapshot versions already are.
function createDiskCache(): ts.ModuleResolutionHost & {
	getDirectories(path: string): string[];
	realpath(path: string): string;
} {
	return {
		directoryExists: memoize((path) => {
			const found = ts.sys.directoryExists(path);
			recorder?.directoryExists(path, found);
			return found;
		}),
		fileExists: memoize((path) => {
			const found = ts.sys.fileExists(path);
			recorder?.fileExists(path, found);
			return found;
		}),
		getCurrentDirectory: () => SITE_ROOT,
		getDirectories: memoize((path) => {
			recorder?.unrepeatable();
			return ts.sys.getDirectories(path);
		}),
		readFile: memoize(readRecorded),
		realpath: memoize((path) => {
			const real = ts.sys.realpath?.(path) ?? path;
			recorder?.realpath(path, real);
			return real;
		}),
		useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
	};
}

function createService(): {
	readonly proxy: ts.LanguageService;
	selectFence(key: string, extension: string, text: string): FenceFile;
} {
	const core = volarRequire('@volar/language-core') as VolarCore;
	const volarTs = volarRequire('@volar/typescript') as VolarTypeScript;

	const fenceByName = new Map<string, FenceFile>();
	let activeFence: FenceFile | undefined;
	let projectVersion = 0;
	const selectFence = (key: string, extension: string, text: string): FenceFile => {
		const fileName = join(SITE_ROOT, `__twoslash_fence__${key}${extension}`);
		let file = fenceByName.get(fileName);
		if (!file) {
			file = { fileName, text, version: 1 };
			fenceByName.set(fileName, file);
		}
		if (activeFence !== file) {
			activeFence = file;
			projectVersion += 1;
		}
		return file;
	};
	const disk = createDiskCache();
	const resolutionCache = ts.createModuleResolutionCache(
		SITE_ROOT,
		(fileName) => (ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase()),
		COMPILER_OPTIONS,
	);
	const diskVersions = new Map<string, string>();
	// Stable snapshots let Volar reuse unchanged imported family documents.
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
		const text = fence ? fence.text : readRecorded(fileName);
		if (text === undefined) return undefined;
		const snapshot = ts.ScriptSnapshot.fromString(text);
		snapshots.set(fileName, { snapshot, version });
		return snapshot;
	};

	const host: ts.LanguageServiceHost = {
		directoryExists: disk.directoryExists,
		fileExists: (path) => fenceByName.has(path) || disk.fileExists(path),
		getCompilationSettings: () => COMPILER_OPTIONS,
		getCurrentDirectory: () => SITE_ROOT,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getDirectories: disk.getDirectories,
		getScriptFileNames: () => (activeFence ? [activeFence.fileName] : []),
		getProjectVersion: () => String(projectVersion),
		getScriptKind: (fileName) => SCRIPT_KINDS[extensionOf(fileName)] ?? ts.ScriptKind.TS,
		getScriptSnapshot: readSnapshot,
		getScriptVersion: versionOf,
		readDirectory: (path, extensions, exclude, include, depth) => {
			recorder?.unrepeatable();
			return ts.sys.readDirectory(path, extensions, exclude, include, depth);
		},
		readFile: disk.readFile,
		// Resolve pnpm aliases to one document-registry identity.
		realpath: disk.realpath,
		// Volar only decorates a resolver the host already has, and its `.tsrx`
		// resolution is the whole point of this service, so a plain one is required.
		resolveModuleNameLiterals: (literals, containingFile, redirected, options, containing) =>
			literals.map((literal) =>
				ts.resolveModuleName(
					literal.text,
					containingFile,
					options,
					disk,
					resolutionCache,
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
		ts.createLanguageService(
			host,
			createReusableDocumentRegistry((path) => fenceByName.has(path)),
		),
	);
	initialize(language);
	return { selectFence, proxy };
}

let shared: ReturnType<typeof createService> | undefined;

export function createQuickInfoService(): QuickInfoService {
	shared ??= createService();
	const { selectFence, proxy } = shared;
	const cache = new Map<string, readonly QuickInfo[]>();

	return {
		queryFence(code: string, language: string): readonly QuickInfo[] {
			const extension = FENCE_EXTENSION[language];
			if (extension === undefined) return [];
			const key = createHash('sha256')
				.update(language)
				.update('\0')
				.update(code)
				.digest('hex');
			const file = selectFence(key, extension, code);
			const cached = cache.get(key);
			if (cached) return cached;

			const seen = new Set<number>();
			const found: QuickInfo[] = [];
			IDENTIFIER.lastIndex = 0;
			for (let match = IDENTIFIER.exec(code); match; match = IDENTIFIER.exec(code)) {
				let info: ts.QuickInfo | undefined;
				try {
					info = proxy.getQuickInfoAtPosition(file.fileName, match.index);
				} catch {
					info = undefined;
				}
				// Module hovers expose build-machine paths.
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

import { readdir, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'pathe';

type ManifestBundle = {
	readonly imports?: readonly string[];
	readonly origins?: readonly string[];
};

type Manifest = {
	readonly bundles?: Record<string, ManifestBundle>;
};

export type RuntimeSizeReportInput = {
	readonly dist: string;
	readonly manifest?: string;
	readonly scripts?: readonly string[];
	readonly includeStaticImports?: boolean;
};

export type RuntimeScriptSize = {
	readonly fileName: string;
	readonly rawBytes: number;
	readonly gzipBytes: number;
	readonly origins: readonly string[];
	readonly hasVitePreloadHelper: boolean;
};

export type RuntimeSizeReport = {
	readonly runtimeChunks: readonly RuntimeScriptSize[];
	readonly largestRuntimeChunk: RuntimeScriptSize | undefined;
	readonly asyncScripts: {
		readonly count: number;
		readonly rawBytes: number;
		readonly gzipBytes: number;
	};
	readonly summary: string;
};

const RUNTIME_ORIGIN_MARKERS = [
	'/protocol/src/',
	'/core/src/runtime.ts',
	'/runtime/src/',
	'/serializer/src/',
];

const RUNTIME_TEXT_MARKERS = [
	'Cannot load async symbol',
	'RuntimeResumeError',
	'createResumeRuntime',
	'createRuntimeGraph',
	'createRuntimeGraphFromStatePayload',
	'resumeContainerEvent',
	'Missing markless/state payload script',
	'async:shared-patch',
	'render(App, { target }) requires',
	'Invalid render target.',
];

export async function runtimeSizeReport(input: RuntimeSizeReportInput): Promise<RuntimeSizeReport> {
	const manifest = input.manifest
		? (JSON.parse(await readFile(input.manifest, 'utf8')) as Manifest)
		: undefined;
	const bundles = manifest?.bundles ?? {};
	const roots = input.scripts?.map(normalizeScriptFileName).filter(isJavaScriptFile);
	const fileNames = roots
		? input.includeStaticImports
			? await collectStaticScriptClosure(input.dist, roots, bundles)
			: roots
		: Object.keys(bundles).filter(isJavaScriptFile).length > 0
			? Object.keys(bundles).filter(isJavaScriptFile)
			: await collectClientScripts(input.dist);
	const scripts = await Promise.all(
		fileNames.map(async (fileName) => {
			const source = await readEmittedScript(input.dist, fileName);
			const sourceText = new TextDecoder().decode(source);
			return {
				fileName,
				rawBytes: source.length,
				gzipBytes: gzipSync(source, { level: 9 }).length,
				origins: bundles[fileName]?.origins ?? [],
				hasVitePreloadHelper: sourceText.includes('vite:preloadError'),
				isRuntimeChunk:
					bundles[fileName]?.origins?.some(isRuntimeOrigin) ??
					sourceLooksRuntimeOwned(sourceText),
			} satisfies RuntimeScriptSize & { readonly isRuntimeChunk: boolean };
		}),
	);
	const runtimeChunks = scripts.filter((script) => script.isRuntimeChunk);
	const largestRuntimeChunk = runtimeChunks.reduce<RuntimeScriptSize | undefined>(
		(largest, script) => {
			if (!largest || script.gzipBytes > largest.gzipBytes) {
				return script;
			}
			return largest;
		},
		undefined,
	);
	const asyncScripts = scripts.reduce(
		(total, script) => ({
			count: total.count + 1,
			rawBytes: total.rawBytes + script.rawBytes,
			gzipBytes: total.gzipBytes + script.gzipBytes,
		}),
		{ count: 0, rawBytes: 0, gzipBytes: 0 },
	);

	return {
		runtimeChunks,
		largestRuntimeChunk,
		asyncScripts,
		summary: formatRuntimeSizeSummary({
			asyncScripts,
			reportLabel: roots
				? input.includeStaticImports
					? 'entry static script closure'
					: 'entry script roots'
				: 'generated async scripts',
			largestRuntimeChunk,
			runtimeChunks,
		}),
	};
}

async function collectStaticScriptClosure(
	dist: string,
	roots: readonly string[],
	bundles: Record<string, ManifestBundle>,
): Promise<string[]> {
	const visited = new Set<string>();
	const visit = async (fileName: string): Promise<void> => {
		if (visited.has(fileName)) return;
		visited.add(fileName);
		for (const imported of await staticImports(dist, fileName, bundles)) {
			if (isJavaScriptFile(imported)) await visit(imported);
		}
	};

	for (const root of roots) await visit(root);
	return [...visited];
}

async function readEmittedScript(dist: string, fileName: string): Promise<Uint8Array> {
	const candidates = fileName.includes('/')
		? [resolve(dist, fileName)]
		: [resolve(dist, 'build', fileName), resolve(dist, fileName)];
	for (const candidate of candidates) {
		try {
			return await readFile(candidate);
		} catch {
			// Try the next production output shape before reporting the missing file.
		}
	}
	throw new Error(
		`Unable to read emitted runtime-size script ${fileName}. Tried: ${candidates.join(', ')}`,
	);
}

async function collectClientScripts(dist: string): Promise<string[]> {
	const files = await listFiles(dist);
	return files
		.filter((fileName) => isJavaScriptFile(fileName) && !fileName.startsWith('server/'))
		.map(normalizeScriptFileName)
		.sort();
}

async function listFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = join(root, entry.name);
		if (entry.isDirectory()) {
			for (const child of await listFiles(entryPath)) {
				files.push(join(entry.name, child));
			}
			continue;
		}
		if (entry.isFile()) files.push(entry.name);
	}
	return files;
}

async function staticImports(
	dist: string,
	fileName: string,
	bundles: Record<string, ManifestBundle>,
): Promise<string[]> {
	const manifestImports = bundles[fileName]?.imports?.filter(isJavaScriptFile);
	if (manifestImports?.length) return manifestImports;

	const source = new TextDecoder().decode(await readEmittedScript(dist, fileName));
	return [...source.matchAll(STATIC_IMPORT_RE)]
		.map((match) => normalizeImportedScript(fileName, match[1]!))
		.filter(isJavaScriptFile);
}

const STATIC_IMPORT_RE = /\bimport(?:(?:\s+|[{\w*])[\s\S]*?\bfrom\s*)?["']([^"']+)["']/g;

function normalizeImportedScript(importer: string, specifier: string): string {
	if (!specifier.startsWith('.')) return normalizeScriptFileName(specifier);
	return normalizeScriptFileName(join(dirname(importer), specifier));
}

function normalizeScriptFileName(script: string): string {
	const pathname = script.split('?')[0] ?? script;
	const normalized = pathname.replaceAll('\\', '/').replace(/^\/+/, '');
	return normalized.startsWith('build/') ? normalized.slice('build/'.length) : normalized;
}

function isJavaScriptFile(fileName: string): boolean {
	return fileName.endsWith('.js');
}

function isRuntimeOrigin(origin: string): boolean {
	const normalized = `/${origin.replaceAll('\\', '/')}`;
	return RUNTIME_ORIGIN_MARKERS.some((marker) => normalized.includes(marker));
}

function sourceLooksRuntimeOwned(source: string): boolean {
	return RUNTIME_TEXT_MARKERS.some((marker) => source.includes(marker));
}

function formatRuntimeSizeSummary(input: {
	readonly asyncScripts: RuntimeSizeReport['asyncScripts'];
	readonly reportLabel: string;
	readonly largestRuntimeChunk: RuntimeScriptSize | undefined;
	readonly runtimeChunks: readonly RuntimeScriptSize[];
}) {
	const largest = input.largestRuntimeChunk
		? `${input.largestRuntimeChunk.fileName} raw=${input.largestRuntimeChunk.rawBytes} gzip=${input.largestRuntimeChunk.gzipBytes}`
		: '(none)';
	const runtimeChunks =
		input.runtimeChunks.length === 0
			? '(none)'
			: input.runtimeChunks
					.map((script) => `${script.fileName} gzip=${script.gzipBytes}`)
					.join(', ');
	return [
		`largest runtime-heavy chunk: ${largest}`,
		`runtime-heavy chunks: ${runtimeChunks}`,
		`${input.reportLabel}: count=${input.asyncScripts.count} raw=${input.asyncScripts.rawBytes} gzip=${input.asyncScripts.gzipBytes}`,
		'spec target: event-only resumer 300-500 B gzip target, 700 B gzip hard budget',
	].join('\n');
}

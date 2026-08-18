import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'pathe';
import { describe, expect, test } from 'vitest';
import { transformTsrxModule } from '../src/rolldown.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const doctrine =
	'Components are build-time markup organization; one render model at three execution times.';

// Component exports have no legitimate client-graph exception. Keeping the empty
// allowlist named makes any future exception an explicit doctrine change here.
const SYMBOLS_ONLY_ALLOWLIST: Readonly<Record<string, string>> = {};

const EMITTED_DOM_ORDER_WALK_ALLOWLIST: Readonly<Record<string, string>> = {
	'packages/web/src/fns/dom-order.ts :: const w = document.createTreeWalker(r, 1);':
		'The neutral emitted locator helper walks elements by compiler-recorded DOM order.',
};

// Exact conditional sites are intentional: adding another environment decision
// requires adding its reason beside the guard instead of quietly distributing posture.
const POSTURE_CONDITIONAL_ALLOWLIST: Readonly<Record<string, string>> = {
	"packages/bundler/src/build/chunking.ts :: if (environment === 'server') {":
		'Build output naming is selected once from the resolved bundler environment.',
	"packages/bundler/src/rolldown.ts :: currentEnvironment === 'client' ||":
		'Invalidation projects the Rolldown environment into the client development graph.',
	"packages/bundler/src/rolldown.ts :: (currentEnvironment === undefined && environment === 'client');":
		'Environment-less invalidation falls back to the already resolved client environment.',
	"packages/bundler/src/rolldown.ts :: if (currentEnvironment !== 'client') {":
		'Rolldown entry signatures are adjusted only for its resolved client build.',
	"packages/bundler/src/rolldown.ts :: if (environment !== 'client') {":
		'Imported symbol facades are materialized only for the resolved client build.',
	"packages/bundler/src/rolldown.ts :: currentEnvironment === 'client' &&":
		'Rolldown transform hooks project the resolved environment into client-only build behavior.',
	"packages/bundler/src/rolldown.ts :: currentEnvironment === 'client' && !renderDataRequest && !clientRouteArtifact;":
		'Only claim-bearing client transforms participate in source publication readiness.',
	"packages/bundler/src/rolldown.ts :: currentEnvironment === 'client' && renderDataRequest":
		'Reached-from lookup is limited to client render-data requests before materialized-route propagation is selected.',
	"packages/bundler/src/rolldown.ts :: currentEnvironment === 'client'":
		'Prerender records are supplied only to the resolved client compilation that emits staged wake modules.',
	"packages/bundler/src/rolldown.ts :: (currentEnvironment === 'client' && clientRouteArtifactSources.has(source)),":
		'Client route artifacts opt their primary source into development-shaped diagnostics.',
	"packages/bundler/src/rolldown.ts :: currentEnvironment === 'client' && !isClientPrimarySourceRequest(id) ? id : source;":
		'Client query facades retain their meaning-bearing manifest identity.',
	"packages/bundler/src/rolldown.ts :: if (currentEnvironment === 'client' && clientRouteArtifact) {":
		'Only client route-artifact requests run package-child materialization.',
	"packages/bundler/src/rolldown.ts :: if (currentEnvironment === 'client' && isClientPrimarySourceRequest(id)) {":
		'Primary-source tracking is scoped to the resolved client graph.',
	"packages/bundler/src/rolldown.ts :: if (currentEnvironment === 'client' && renderDataRequest) {":
		'Client render-data requests are answered with the client-shaped module from the resolved build environment.',
	"packages/bundler/src/rolldown.ts :: internalOptions.dev === true && currentEnvironment === 'server'":
		'Development resume URLs are emitted by the resolved server compilation.',
	"packages/bundler/src/rolldown.ts :: : currentEnvironment === 'server'":
		'Production resume URLs are selected by the resolved server compilation.',
	"packages/bundler/src/rolldown.ts :: currentEnvironment === 'server'":
		'Production prerender-wake URLs are selected by the resolved server compilation.',
	"packages/bundler/src/rolldown.ts :: if (currentEnvironment === 'client' && prerenderWakeRequest) {":
		'Prerender-wake source requests are answered only in the resolved client compilation.',
	"packages/bundler/src/rolldown.ts :: devResumeReexport: internalOptions.dev === true && currentEnvironment === 'client',":
		'Development resume re-exports keep source modules in the resolved client graph.',
	"packages/bundler/src/rolldown.ts :: if (currentEnvironment === 'client' && isResumeSourceRequest(id)) {":
		'Resume virtual modules are returned only to their resolved client request.',
	"packages/bundler/src/rolldown.ts :: if (currentEnvironment === 'client' && !internalOptions.dev) {":
		'Production client virtual modules are registered from the resolved build environment.',
	"packages/bundler/src/rolldown.ts :: const isClientSymbol = input.environment === 'client' && module.type === 'symbol';":
		'Virtual-module storage qualifies symbols using the transform input environment.',
	"packages/bundler/src/source-module.ts :: const symbolsOnly = input.environment === 'client' && input.clientOutput === 'symbols-only';":
		'Source emission derives its symbols-only module shape from compiler input.',
	"packages/bundler/src/source-module.ts :: const routeSymbols = input.environment === 'client' && input.symbolRoutes.length > 0;":
		'Source emission creates symbol routes only for a client module shape.',
	"packages/bundler/src/source-module.ts :: (input.environment === 'client' &&":
		'Source emission omits render-data imports for the resolved client-only shape.',
	"packages/bundler/src/source-module.ts :: input.environment === 'client' && input.executionLog !== 'never'":
		'Source emission includes execution logging only in client output.',
	"packages/bundler/src/source-module.ts :: input.devResumeReexport && input.environment === 'client'":
		'Source emission adds the development resume edge only to client output.',
	"packages/bundler/src/source-module.ts :: input.environment === 'server' || symbolsOnly || input.prerenderRecords":
		'Source emission excludes client render bodies from server and symbols-only shapes.',
	"packages/bundler/src/source-module.ts :: input.environment === 'client' && (symbolsOnly || (!input.prerenderRecords && !input.dev))":
		'Source emission omits the canonical SSR module from production ordinary and symbols-only client output while retaining it for server, prerender, and development output.',
	"packages/bundler/src/source-module.ts :: input.environment === 'client' &&":
		'Source emission keeps SSR code out of production ordinary and symbols-only client output while dev uses the canonical SSR surface for mounting.',
	"packages/bundler/src/source-module.ts :: input.rootExportName && input.environment !== 'server' && !input.prerenderRecords":
		'Compiled app metadata includes a direct render entry outside server-only output.',
	"packages/bundler/src/source-module.ts :: input.environment !== 'server' && input.rootExportName === null":
		'Non-server linked artifacts retain their emitted symbol loader when no direct render body exists.',
	"packages/bundler/src/source-module.ts :: (input.environment !== 'client' || input.prerenderRecords || input.dev)":
		'Compiled app metadata exposes canonical SSR rendering on servers, prerender builds, and development client mounts.',
	"packages/bundler/src/source-module.ts :: input.resumeModuleUrl && input.environment !== 'client'":
		'Compiled app metadata exposes resume URLs only from non-client output.',
	"packages/bundler/src/source-module.ts :: input.prerenderWakeModuleUrl && input.environment !== 'client'":
		'Compiled app metadata exposes prerender-wake URLs only from non-client output.',
	"packages/bundler/src/source-module.ts :: input.inlineResumerSources && input.environment !== 'client'":
		'Compiled app metadata exposes inline resumers only from non-client output.',
	"packages/bundler/src/source-module.ts :: input.prerenderBoot && input.environment !== 'client'":
		'Compiled app metadata exposes the prerender settle boot only from non-client output.',
	"packages/bundler/src/source-module.ts :: input.headInjections?.length && input.environment !== 'client'":
		'Compiled app metadata exposes document head injections only from non-client output.',
	"packages/bundler/src/source-module.ts :: input.storageSeeds?.length && input.environment !== 'client'":
		'Compiled app metadata exposes storage seeds only from non-client output.',
	"packages/bundler/src/source-module.ts :: input.resumeModuleUrl && input.environment === 'server'":
		'Compiled app metadata emits module preloads from server output.',
	"packages/bundler/src/source-module.ts :: input.environment === 'client'":
		'Compiled app metadata omits server document fields from client output.',
	"packages/bundler/src/source-module.ts :: input.environment === 'client' && input.directCsr === true && input.hasComputedState === true":
		'A CSR mount builds its graph from client output that has no resume module, so the derived reconcile plane installs there instead of in the resume module.',
	"packages/bundler/src/transform.ts :: const linkedClientRenderData = input.environment === 'client' && !input.prerenderRecords;":
		'Build-time source emission recursively links ordinary client render-data modules while prerender records use their separately resolved shape.',
	"packages/bundler/src/transform.ts :: input.environment === 'server' ? await compilePrerenderInlineResumerSources() : undefined;":
		'Prerender boot scripts are compiled once for the resolved server compilation that inlines them into the document.',
	"packages/bundler/src/transform.ts :: input.input.environment !== 'client' ||":
		'Linked render-data boundary symbols are emitted only for the resolved client compilation that can demand them.',
	"packages/bundler/src/vite/environment.ts :: if (environment === 'client') {":
		'This file is the Vite environment-name resolver for client posture.',
	"packages/bundler/src/vite/environment.ts :: if (environment === 'server') {":
		'This file is the Vite environment-name resolver for server posture.',
	"packages/bundler/src/vite/index.ts :: const prerender = process.env.MARKLESS_PRERENDER === '1';":
		'The Vite host adapter reads the process flag once at plugin construction.',
	'packages/bundler/src/vite/index.ts :: const explicitPrerenderWake = process.env.MARKLESS_PRERENDER_WAKE;':
		'The Vite host adapter reads the wake-channel override once at plugin construction.',
	"packages/bundler/src/vite/index.ts :: ...(environment === 'client'":
		'Vite configuration projects the resolved client environment into module preload settings.',
	'packages/bundler/src/vite/index.ts :: if (config.build?.lib || config.build?.ssr) {':
		'Vite setup preserves consumer-owned library and SSR build configuration.',
	"packages/bundler/src/vite/index.ts :: if (environment === 'server') {":
		'Vite output directories are selected from the resolved environment.',
	"packages/web/src/debug-channel.ts :: phase = nextPhase === 'ssr-resume' && phase === 'csr' ? 'csr' : nextPhase;":
		'Debug reporting preserves an already observed direct-CSR phase; it does not select runtime posture.',
};

type ClientGraphEntry = {
	readonly file: string;
	readonly componentNames: readonly string[];
	readonly code: string;
};

type SourceMatch = {
	readonly key: string;
	readonly file: string;
	readonly line: number;
	readonly source: string;
};

describe('mechanical doctrine guard', () => {
	test('every fixture client-graph entry is symbols-only', async () => {
		const plantedViolation: ClientGraphEntry = {
			file: 'self-test/LeakedCard.tsrx',
			componentNames: ['LeakedCard'],
			code: 'export function LeakedCard() { return document.body; }',
		};
		expect(() => assertSymbolsOnly([plantedViolation])).toThrow(doctrine);

		const fixtureRoot = resolve(repoRoot, 'packages/bundler/fixtures');
		const files = await findFiles(fixtureRoot, '.tsrx');
		const entries = await Promise.all(
			files.map(async (file): Promise<ClientGraphEntry> => {
				const source = await readFile(file, 'utf8');
				const transformed = await transformTsrxModule({
					filename: file,
					source,
					environment: 'client',
					clientOutput: 'symbols-only',
				});
				return {
					file: relative(repoRoot, file),
					componentNames: exportedComponentNames(source),
					code: transformed.code,
				};
			}),
		);

		expect(files.length, 'the doctrine guard must cover fixture TSRX entries').toBeGreaterThan(
			0,
		);
		assertSymbolsOnly(entries);
	});

	test('posture conditionals stay in resolvers or the reasoned allowlist', async () => {
		const planted = sourceMatches(
			'self-test/runtime.ts',
			"if (environment === 'client') mountComponent();",
			postureConditionalPatterns,
		);
		expect(() => assertAllowlisted('posture conditional', planted, {})).toThrow(doctrine);

		const roots = ['packages/bundler/src', 'packages/web/src'];
		const matches = (
			await Promise.all(
				roots.map(async (root) => {
					const absoluteRoot = resolve(repoRoot, root);
					return sourceMatchesForTree(absoluteRoot, postureConditionalPatterns);
				}),
			)
		).flat();
		assertAllowlisted('posture conditional', matches, POSTURE_CONDITIONAL_ALLOWLIST);
	});

	test('emitted DOM-order walks stay in the exact-line allowlist', async () => {
		const file = 'packages/web/src/fns/dom-order.ts';
		const matches = sourceMatches(file, await readFile(resolve(repoRoot, file), 'utf8'), [
			/\bcreateTreeWalker\b/,
		]);
		assertAllowlisted('emitted DOM-order walk', matches, EMITTED_DOM_ORDER_WALK_ALLOWLIST);
	});

	test('native mount paths never invoke component renderCsr artifacts', async () => {
		const invocation = /(?:\.|\?\.)renderCsr(?:\?\.)?\s*\(/;
		expect(invocation.test('artifact.renderCsr(props)')).toBe(true);
		for (const file of [
			'packages/web/src/render-csr.ts',
			'packages/router/src/route-renderer.ts',
		]) {
			expect(await readFile(resolve(repoRoot, file), 'utf8'), file).not.toMatch(invocation);
		}
	});
});

function assertSymbolsOnly(entries: readonly ClientGraphEntry[]): void {
	const violations: string[] = [];
	for (const entry of entries) {
		if (SYMBOLS_ONLY_ALLOWLIST[entry.file]) continue;
		for (const name of entry.componentNames) {
			const escaped = escapeRegExp(name);
			if (
				new RegExp(
					`\\bexport\\s+(?:default\\s+)?(?:async\\s+)?function\\s+${escaped}\\b`,
				).test(entry.code) ||
				new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b`, 's').test(entry.code)
			) {
				violations.push(`${entry.file}: exported component symbol ${name}`);
			}
		}
		if (/\b(?:renderCsr\s*:|marklessCompiledApp)\b/.test(entry.code)) {
			violations.push(`${entry.file}: retained a component render body`);
		}
	}
	if (violations.length > 0) {
		throw doctrineError(
			'client graphs must export symbols only',
			violations,
			'SYMBOLS_ONLY_ALLOWLIST',
		);
	}
}

const postureConditionalPatterns = [
	/process\.env\.MARKLESS_PRERENDER/,
	/\benvironment\s*[!=]==?\s*['"](?:client|server)['"]/,
	/['"](?:client|server)['"]\s*[!=]==?\s*environment\b/,
	/\bcurrentEnvironment\s*[!=]==?\s*['"](?:client|server)['"]/,
	/\binput\.environment\s*[!=]==?\s*['"](?:client|server)['"]/,
	/\bphase\s*[!=]==?\s*['"]csr['"]/,
	/['"]csr['"]\s*[!=]==?\s*phase\b/,
	/\.build\?*\.ssr\b/,
] as const;

async function sourceMatchesForTree(
	root: string,
	patterns: readonly RegExp[],
): Promise<SourceMatch[]> {
	const files = await findFiles(root, '.ts');
	return (
		await Promise.all(
			files.map(async (file) =>
				sourceMatches(relative(repoRoot, file), await readFile(file, 'utf8'), patterns),
			),
		)
	).flat();
}

function sourceMatches(file: string, source: string, patterns: readonly RegExp[]): SourceMatch[] {
	return source.split('\n').flatMap((rawLine, index) => {
		const line = rawLine.trim();
		if (!patterns.some((pattern) => pattern.test(line))) return [];
		return [{ key: `${file} :: ${line}`, file, line: index + 1, source: line }];
	});
}

function assertAllowlisted(
	kind: string,
	matches: readonly SourceMatch[],
	allowlist: Readonly<Record<string, string>>,
): void {
	const actual = new Set(matches.map((match) => match.key));
	const violations = matches
		.filter((match) => !allowlist[match.key])
		.map((match) => `${match.file}:${match.line}: ${match.source}`);
	for (const key of Object.keys(allowlist)) {
		if (!actual.has(key)) violations.push(`stale allowlist entry: ${key}`);
	}
	if (violations.length > 0) {
		throw doctrineError(kind, violations, 'POSTURE_CONDITIONAL_ALLOWLIST');
	}
}

function doctrineError(kind: string, violations: readonly string[], allowlist: string): Error {
	return new Error(
		[
			`DOCTRINE GUARD FAILED: ${kind}.`,
			doctrine,
			...violations,
			`Allowlist: ${allowlist} in ${relative(repoRoot, import.meta.filename)}`,
		].join('\n'),
	);
}

async function findFiles(root: string, suffix: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true });
	const files = await Promise.all(
		entries.map((entry) => {
			const path = resolve(root, entry.name);
			return entry.isDirectory()
				? findFiles(path, suffix)
				: Promise.resolve(path.endsWith(suffix) ? [path] : []);
		}),
	);
	return files.flat().sort();
}

function exportedComponentNames(source: string): string[] {
	return [
		...source.matchAll(
			/\bexport\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*@\{/g,
		),
	].map((match) => match[1]!);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

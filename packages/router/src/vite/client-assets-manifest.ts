import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative } from 'pathe';
import { joinURL } from 'ufo';

export const MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST = '.vite/markless-router-client-manifest.json';

const MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST_VERSION = 1;
const VALID_ROUTE_FILE = /^pages\/.+\.(?:tsrx|mdx)$/;
const ABSOLUTE_OR_PROTOCOL_RELATIVE_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

export interface MarklessRouterClientAssetRoutes {
	readonly navigation: Record<string, readonly string[]>;
	readonly ssr: Record<string, readonly string[]>;
	readonly styles: Record<string, readonly string[]>;
}

export interface MarklessRouterClientAssetsManifest {
	readonly version: 1;
	readonly base: string;
	readonly entries: {
		readonly resume: string;
		readonly prerenderWake?: string;
		readonly navigation: string;
	};
	readonly routes: MarklessRouterClientAssetRoutes;
}

export function createClientAssetsManifest(input: {
	readonly base: string;
	readonly resumeEntry: string;
	readonly prerenderWakeEntry?: string;
	readonly navigationEntry: string;
	readonly routes: MarklessRouterClientAssetRoutes;
}): MarklessRouterClientAssetsManifest {
	return {
		version: MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST_VERSION,
		base: input.base,
		entries: {
			resume: input.resumeEntry,
			...(input.prerenderWakeEntry ? { prerenderWake: input.prerenderWakeEntry } : {}),
			navigation: input.navigationEntry,
		},
		routes: {
			navigation: sortRouteMap(input.routes.navigation),
			ssr: sortRouteMap(input.routes.ssr),
			styles: sortRouteMap(input.routes.styles),
		},
	};
}

export async function removeClientAssetsManifest(clientOutDir: string): Promise<void> {
	const path = clientAssetsManifestPath(clientOutDir);
	await Promise.all([
		rm(path, { force: true }),
		rm(clientAssetsManifestTemporaryPath(clientOutDir), { force: true }),
	]);
}

export async function writeClientAssetsManifest(
	clientOutDir: string,
	manifest: MarklessRouterClientAssetsManifest,
): Promise<void> {
	const validated = await validateClientAssetsManifest(manifest, manifest.base, clientOutDir);
	const path = clientAssetsManifestPath(clientOutDir);
	const temporaryPath = clientAssetsManifestTemporaryPath(clientOutDir);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
	await rename(temporaryPath, path);
}

export async function readClientAssetsManifest(
	clientOutDir: string,
	base: string,
): Promise<MarklessRouterClientAssetsManifest> {
	const path = clientAssetsManifestPath(clientOutDir);
	let source: string;
	try {
		source = await readFile(path, 'utf8');
	} catch (error) {
		throw clientAssetsManifestError(
			`is missing at ${path}. Build the client environment before the server environment`,
			error,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch (error) {
		throw clientAssetsManifestError(`is malformed at ${path}`, error);
	}

	return validateClientAssetsManifest(parsed, base, clientOutDir);
}

export function clientAssetFileName(href: string, base: string): string {
	const dummyOrigin = 'https://markless-router.invalid/';
	if (
		hasControlCharacter(href) ||
		(!ABSOLUTE_OR_PROTOCOL_RELATIVE_URL.test(base) &&
			ABSOLUTE_OR_PROTOCOL_RELATIVE_URL.test(href))
	) {
		throw clientAssetsManifestError(
			`contains an asset URL outside base ${JSON.stringify(base)}: ${JSON.stringify(href)}`,
		);
	}
	let baseUrl: URL;
	let assetUrl: URL;
	try {
		baseUrl = new URL(base || '/', dummyOrigin);
		assetUrl = new URL(href, baseUrl);
	} catch (error) {
		throw clientAssetsManifestError(
			`contains an invalid asset URL ${JSON.stringify(href)}`,
			error,
		);
	}

	if (assetUrl.origin !== baseUrl.origin || assetUrl.search || assetUrl.hash) {
		throw clientAssetsManifestError(
			`contains an asset URL outside base ${JSON.stringify(base)}: ${JSON.stringify(href)}`,
		);
	}
	const basePath = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`;
	if (!assetUrl.pathname.startsWith(basePath)) {
		throw clientAssetsManifestError(
			`contains an asset URL outside base ${JSON.stringify(base)}: ${JSON.stringify(href)}`,
		);
	}

	let fileName: string;
	try {
		fileName = decodeURIComponent(assetUrl.pathname.slice(basePath.length));
	} catch (error) {
		throw clientAssetsManifestError(
			`contains an invalid encoded asset URL ${JSON.stringify(href)}`,
			error,
		);
	}
	const normalized = normalize(fileName);
	if (
		fileName === '' ||
		hasControlCharacter(fileName) ||
		fileName.includes('\\') ||
		isAbsolute(fileName) ||
		normalized !== fileName ||
		normalized === '..' ||
		normalized.startsWith('../')
	) {
		throw clientAssetsManifestError(`contains an unsafe asset path ${JSON.stringify(href)}`);
	}
	if (href !== joinURL(base, fileName)) {
		throw clientAssetsManifestError(
			`contains a non-canonical asset URL ${JSON.stringify(href)} for base ${JSON.stringify(base)}`,
		);
	}
	return fileName;
}

function clientAssetsManifestPath(clientOutDir: string): string {
	return join(clientOutDir, MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST);
}

function clientAssetsManifestTemporaryPath(clientOutDir: string): string {
	return `${clientAssetsManifestPath(clientOutDir)}.tmp`;
}

async function validateClientAssetsManifest(
	input: unknown,
	base: string,
	clientOutDir: string,
): Promise<MarklessRouterClientAssetsManifest> {
	if (!isRecord(input)) {
		throw clientAssetsManifestError('must be a JSON object');
	}
	if (input.version !== MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST_VERSION) {
		throw clientAssetsManifestError(
			`has unsupported version ${JSON.stringify(input.version)}; expected ${MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST_VERSION}`,
		);
	}
	if (input.base !== base) {
		throw clientAssetsManifestError(
			`was built for base ${JSON.stringify(input.base)}; expected ${JSON.stringify(base)}`,
		);
	}
	if (!isRecord(input.entries)) {
		throw clientAssetsManifestError('has invalid entries');
	}
	if (!isRecord(input.routes)) {
		throw clientAssetsManifestError('has invalid route maps');
	}

	const entries = {
		resume: requiredString(input.entries.resume, 'entries.resume'),
		...(input.entries.prerenderWake !== undefined
			? {
					prerenderWake: requiredString(
						input.entries.prerenderWake,
						'entries.prerenderWake',
					),
				}
			: {}),
		navigation: requiredString(input.entries.navigation, 'entries.navigation'),
	};
	const routes = {
		navigation: routeMap(input.routes.navigation, 'routes.navigation'),
		ssr: routeMap(input.routes.ssr, 'routes.ssr'),
		styles: routeMap(input.routes.styles, 'routes.styles'),
	};
	assertMatchingRouteKeys(routes);

	const hrefs = new Set([
		entries.resume,
		...(entries.prerenderWake !== undefined ? [entries.prerenderWake] : []),
		entries.navigation,
		...Object.values(routes.navigation).flat(),
		...Object.values(routes.ssr).flat(),
		...Object.values(routes.styles).flat(),
	]);
	for (const href of hrefs) {
		const fileName = clientAssetFileName(href, base);
		const assetPath = join(clientOutDir, fileName);
		const relativeAssetPath = relative(clientOutDir, assetPath);
		if (
			relativeAssetPath === '..' ||
			relativeAssetPath.startsWith('../') ||
			isAbsolute(relativeAssetPath)
		) {
			throw clientAssetsManifestError(
				`contains an unsafe asset path ${JSON.stringify(href)}`,
			);
		}
		try {
			if (!(await stat(assetPath)).isFile()) throw new Error('not a file');
		} catch (error) {
			throw clientAssetsManifestError(
				`references missing client asset ${JSON.stringify(href)}`,
				error,
			);
		}
	}

	return {
		version: MARKLESS_ROUTER_CLIENT_ASSETS_MANIFEST_VERSION,
		base,
		entries,
		routes,
	};
}

function routeMap(input: unknown, label: string): Record<string, readonly string[]> {
	if (!isRecord(input)) throw clientAssetsManifestError(`has invalid ${label}`);
	const routes: Record<string, readonly string[]> = {};
	for (const [routeFile, hrefs] of Object.entries(input)) {
		let decodedRouteFile: string;
		try {
			decodedRouteFile = decodeURIComponent(routeFile);
		} catch (error) {
			throw clientAssetsManifestError(
				`contains invalid route key ${JSON.stringify(routeFile)}`,
				error,
			);
		}
		if (
			!VALID_ROUTE_FILE.test(routeFile) ||
			hasControlCharacter(routeFile) ||
			decodedRouteFile !== routeFile ||
			routeFile.includes('\\') ||
			normalize(routeFile) !== routeFile
		) {
			throw clientAssetsManifestError(
				`contains invalid route key ${JSON.stringify(routeFile)}`,
			);
		}
		if (!Array.isArray(hrefs) || !hrefs.every((href) => typeof href === 'string')) {
			throw clientAssetsManifestError(
				`has invalid assets for route ${JSON.stringify(routeFile)}`,
			);
		}
		routes[routeFile] = hrefs;
	}
	return routes;
}

function assertMatchingRouteKeys(routes: MarklessRouterClientAssetRoutes): void {
	const navigationKeys = Object.keys(routes.navigation).toSorted();
	for (const [label, routeMap] of [
		['SSR', routes.ssr],
		['style', routes.styles],
	] as const) {
		const keys = Object.keys(routeMap).toSorted();
		if (JSON.stringify(keys) !== JSON.stringify(navigationKeys)) {
			throw clientAssetsManifestError(
				`${label} route keys do not match navigation route keys`,
			);
		}
	}
}

function sortRouteMap(
	routes: Record<string, readonly string[]>,
): Record<string, readonly string[]> {
	return Object.fromEntries(
		Object.entries(routes)
			.toSorted(([left], [right]) => left.localeCompare(right))
			.map(([routeFile, hrefs]) => [routeFile, [...hrefs]]),
	);
}

function requiredString(input: unknown, label: string): string {
	if (typeof input !== 'string' || input === '') {
		throw clientAssetsManifestError(`has invalid ${label}`);
	}
	return input;
}

function hasControlCharacter(input: string): boolean {
	for (let index = 0; index < input.length; index++) {
		const code = input.charCodeAt(index);
		if (code <= 0x1f || code === 0x7f) return true;
	}
	return false;
}

function isRecord(input: unknown): input is Record<string, unknown> {
	return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function clientAssetsManifestError(message: string, cause?: unknown): Error {
	return new Error(`Markless Router client-assets manifest ${message}.`, { cause });
}

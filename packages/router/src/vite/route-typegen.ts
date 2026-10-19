import { dirname, extname, join, relative } from 'pathe';
import type { Plugin } from 'vite';
import { withLeadingSlash } from 'ufo';
import { assertNoEndpointConflicts, buildRouteManifestFromFileIds } from '../route-manifest.ts';
import { API_DIR, REQUEST_FILE_EXTENSION } from '../request-files.ts';
import {
	createRouteTypesDeclaration,
	routeTypesEnvDeclaration,
	routeTypesEnvPath,
	routeTypesOutputPath,
} from '../route-types.ts';

export type RouteTypegenFileSystem = {
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	readdir(path: string, options?: { withFileTypes?: true }): Promise<RouteTypegenDirent[]>;
	readFile(path: string, options: { encoding: 'utf8' }): Promise<string>;
	writeFile(path: string, data: string, options?: { encoding?: 'utf8' }): Promise<void>;
};

export type RouteTypegenDirent = {
	name: string;
	isDirectory(): boolean;
	isFile(): boolean;
};

const PAGE_EXTENSIONS = new Set(['.tsrx', '.mdx']);
const ENDPOINT_EXTENSIONS = new Set([REQUEST_FILE_EXTENSION]);

export function routeTypegenPlugin(): Plugin {
	let root = '';

	return {
		name: 'markless-router:typegen',
		configResolved(config) {
			root = config.root;
		},
		async buildStart() {
			await writeRouteTypes(this.fs, root);
		},
		async watchChange() {
			await writeRouteTypes(this.fs, root);
		},
	};
}

export async function writeRouteTypes(fs: RouteTypegenFileSystem, root: string): Promise<void> {
	const pageFiles = await discoverPageFiles(fs, root);
	const manifest = buildRouteManifestFromFileIds(pageFiles);
	assertNoEndpointConflicts(
		manifest,
		await discoverFiles(fs, root, API_DIR, ENDPOINT_EXTENSIONS),
	);

	await writeIfChanged(fs, join(root, routeTypesEnvPath), routeTypesEnvDeclaration);
	await writeIfChanged(
		fs,
		join(root, routeTypesOutputPath),
		createRouteTypesDeclaration(manifest),
	);
}

export function discoverPageFiles(fs: RouteTypegenFileSystem, root: string): Promise<string[]> {
	return discoverFiles(fs, root, 'pages', PAGE_EXTENSIONS);
}

async function discoverFiles(
	fs: RouteTypegenFileSystem,
	root: string,
	dir: string,
	extensions: ReadonlySet<string>,
): Promise<string[]> {
	const files: string[] = [];

	await collectFiles(fs, root, join(root, dir), extensions, files);

	return files.toSorted((left, right) => left.localeCompare(right));
}

async function collectFiles(
	fs: RouteTypegenFileSystem,
	root: string,
	dir: string,
	extensions: ReadonlySet<string>,
	files: string[],
): Promise<void> {
	const entries = await readdirIfExists(fs, dir);

	await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) await collectFiles(fs, root, path, extensions, files);
			else if (entry.isFile() && extensions.has(extname(path)))
				files.push(withLeadingSlash(relative(root, path)));
		}),
	);
}

async function readdirIfExists(
	fs: RouteTypegenFileSystem,
	dir: string,
): Promise<RouteTypegenDirent[]> {
	try {
		return await fs.readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (isNotFoundError(error)) {
			return [];
		}

		throw error;
	}
}

async function writeIfChanged(
	fs: RouteTypegenFileSystem,
	path: string,
	contents: string,
): Promise<void> {
	const currentContents = await readExistingText(fs, path);
	if (currentContents === contents) {
		return;
	}

	await fs.mkdir(dirname(path), { recursive: true });
	await fs.writeFile(path, contents, { encoding: 'utf8' });
}

async function readExistingText(
	fs: RouteTypegenFileSystem,
	path: string,
): Promise<string | undefined> {
	try {
		return await fs.readFile(path, { encoding: 'utf8' });
	} catch (error) {
		if (isNotFoundError(error)) {
			return undefined;
		}

		throw error;
	}
}

function isNotFoundError(error: unknown): boolean {
	return typeof error === 'object' && error !== null && 'code' in error
		? (error as { code?: unknown }).code === 'ENOENT'
		: false;
}

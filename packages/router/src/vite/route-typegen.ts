import { dirname, extname, join, relative } from 'pathe';
import type { Plugin } from 'vite';
import { withLeadingSlash } from 'ufo';
import { buildRouteManifestFromFileIds } from '../route-manifest.ts';
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

	await writeIfChanged(fs, join(root, routeTypesEnvPath), routeTypesEnvDeclaration);
	await writeIfChanged(
		fs,
		join(root, routeTypesOutputPath),
		createRouteTypesDeclaration(manifest),
	);
}

export async function discoverPageFiles(
	fs: RouteTypegenFileSystem,
	root: string,
): Promise<string[]> {
	const pagesDir = join(root, 'pages');
	const files: string[] = [];

	await collectPageFiles(fs, root, pagesDir, files);

	return files.toSorted((left, right) => left.localeCompare(right));
}

async function collectPageFiles(
	fs: RouteTypegenFileSystem,
	root: string,
	dir: string,
	files: string[],
): Promise<void> {
	const entries = await readdirIfExists(fs, dir);

	await Promise.all(entries.map((entry) => collectPageFile(fs, root, dir, files, entry)));
}

async function collectPageFile(
	fs: RouteTypegenFileSystem,
	root: string,
	dir: string,
	files: string[],
	entry: RouteTypegenDirent,
): Promise<void> {
	const path = join(dir, entry.name);

	if (entry.isDirectory()) {
		await collectPageFiles(fs, root, path, files);
		return;
	}

	if (entry.isFile() && PAGE_EXTENSIONS.has(extname(path))) {
		files.push(withLeadingSlash(relative(root, path)));
	}
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

import { expect, test } from 'vitest';
import {
	discoverPageFiles,
	type RouteTypegenDirent,
	type RouteTypegenFileSystem,
} from '../src/vite/route-typegen.ts';

test('discovers TSRX and MDX page files through the Vite host filesystem', async () => {
	const fs = mockRouteTypegenFs({
		'/project/pages': [
			dirent('index.tsrx', 'file'),
			dirent('about.mdx', 'file'),
			dirent('ignored.tsx', 'file'),
			dirent('docs', 'directory'),
		],
		'/project/pages/docs': [dirent('[...slug].mdx', 'file')],
	});

	await expect(discoverPageFiles(fs, '/project')).resolves.toEqual([
		'/pages/about.mdx',
		'/pages/docs/[...slug].mdx',
		'/pages/index.tsrx',
	]);
});

function mockRouteTypegenFs(
	directories: Record<string, readonly RouteTypegenDirent[]>,
): RouteTypegenFileSystem {
	return {
		async mkdir() {},
		async readFile() {
			throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
		},
		async readdir(path) {
			const entries = directories[path];
			if (!entries) throw Object.assign(new Error(`Not found: ${path}`), { code: 'ENOENT' });
			return [...entries];
		},
		async writeFile() {},
	};
}

function dirent(name: string, kind: 'directory' | 'file'): RouteTypegenDirent {
	return {
		isDirectory: () => kind === 'directory',
		isFile: () => kind === 'file',
		name,
	};
}

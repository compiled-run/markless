import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const benchmarkRoot = fileURLToPath(new URL('.', import.meta.url));
const arcadeRoot = resolve(process.env.ARCADE_REPO_ROOT ?? '../../../../..');

function arcadePackage(path: string) {
	return resolve(arcadeRoot, path);
}

const { arcade } = await import(
	pathToFileURL(arcadePackage('packages/bundler/src/vite/index.ts')).href
);

export default {
	root: benchmarkRoot,
	base: './',
	plugins: [arcade()],
	build: {
		emptyOutDir: true,
		modulePreload: false,
		outDir: 'dist',
		target: 'es2022',
	},
	resolve: {
		alias: [
			{
				find: '@arcade/bundler/vite',
				replacement: arcadePackage('packages/bundler/src/vite/index.ts'),
			},
			{
				find: '@arcade/bundler/rolldown',
				replacement: arcadePackage('packages/bundler/src/rolldown.ts'),
			},
			{
				find: '@arcade/runtime/render',
				replacement: arcadePackage('packages/runtime/src/render.ts'),
			},
			{
				find: '@arcade/runtime',
				replacement: arcadePackage('packages/runtime/src/index.ts'),
			},
			{
				find: 'arcade',
				replacement: arcadePackage('packages/arcade/src/index.ts'),
			},
			{
				find: '@arcade/serializer',
				replacement: arcadePackage('packages/serializer/src/index.ts'),
			},
		],
	},
};

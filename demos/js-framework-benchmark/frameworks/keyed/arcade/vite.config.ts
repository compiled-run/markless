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
				find: '@arcade/web/render',
				replacement: arcadePackage('packages/web/src/render.ts'),
			},
			{
				find: '@arcade/web/event-only-resume',
				replacement: arcadePackage('packages/web/src/event-only-resume.ts'),
			},
			{
				find: '@arcade/runtime',
				replacement: arcadePackage('packages/runtime/src/index.ts'),
			},
			{
				find: 'arcade/preload',
				replacement: arcadePackage('packages/arcade/src/preload.ts'),
			},
			{
				find: 'arcade/web/event-only-resume',
				replacement: arcadePackage('packages/arcade/src/web/event-only-resume.ts'),
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

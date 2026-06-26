import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const benchmarkRoot = fileURLToPath(new URL('.', import.meta.url));
const arcadeRoot = resolve(process.env.ARCADE_REPO_ROOT ?? '../../../../..');

function arcadePackage(path: string) {
	return resolve(arcadeRoot, path);
}

const hasWebPackage = existsSync(arcadePackage('packages/web/src/render.ts'));
const webOrRuntimeRender = hasWebPackage
	? 'packages/web/src/render.ts'
	: 'packages/runtime/src/render.ts';
const webOrRuntimeEventOnlyResume = hasWebPackage
	? 'packages/web/src/event-only-resume.ts'
	: 'packages/runtime/src/event-only-resume.ts';
const arcadeWebOrRuntimeEventOnlyResume = hasWebPackage
	? 'packages/arcade/src/web/event-only-resume.ts'
	: 'packages/arcade/src/runtime/event-only-resume.ts';

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
				replacement: arcadePackage(webOrRuntimeRender),
			},
			{
				find: '@arcade/runtime/render',
				replacement: arcadePackage(webOrRuntimeRender),
			},
			{
				find: '@arcade/web/event-only-resume',
				replacement: arcadePackage(webOrRuntimeEventOnlyResume),
			},
			{
				find: '@arcade/runtime/event-only-resume',
				replacement: arcadePackage(webOrRuntimeEventOnlyResume),
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
				replacement: arcadePackage(arcadeWebOrRuntimeEventOnlyResume),
			},
			{
				find: 'arcade/runtime/event-only-resume',
				replacement: arcadePackage(arcadeWebOrRuntimeEventOnlyResume),
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

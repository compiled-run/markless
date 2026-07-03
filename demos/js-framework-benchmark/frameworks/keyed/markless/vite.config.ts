import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const benchmarkRoot = fileURLToPath(new URL('.', import.meta.url));
const marklessRoot = resolve(process.env.MARKLESS_REPO_ROOT ?? '../../../../..');

function marklessPackage(path: string) {
	return resolve(marklessRoot, path);
}

const hasWebPackage = existsSync(marklessPackage('packages/web/src/render.ts'));
const webOrRuntimeRender = hasWebPackage
	? 'packages/web/src/render.ts'
	: 'packages/runtime/src/render.ts';
const webOrRuntimeEventOnlyResume = hasWebPackage
	? 'packages/web/src/event-only-resume.ts'
	: 'packages/runtime/src/event-only-resume.ts';
const marklessWebOrRuntimeEventOnlyResume = hasWebPackage
	? 'packages/core/src/web/event-only-resume.ts'
	: 'packages/core/src/runtime/event-only-resume.ts';
const marklessWebOrRuntimeResume = hasWebPackage
	? 'packages/core/src/web/resume.ts'
	: 'packages/core/src/runtime/resume.ts';

const { markless } = await import(
	pathToFileURL(marklessPackage('packages/bundler/src/vite/index.ts')).href
);

export default {
	root: benchmarkRoot,
	base: './',
	plugins: [markless()],
	build: {
		emptyOutDir: true,
		modulePreload: false,
		outDir: 'dist',
		target: 'es2022',
	},
	resolve: {
		alias: [
			{
				find: '@markless/bundler/vite',
				replacement: marklessPackage('packages/bundler/src/vite/index.ts'),
			},
			{
				find: '@markless/bundler/rolldown',
				replacement: marklessPackage('packages/bundler/src/rolldown.ts'),
			},
			{
				find: '@markless/web/render',
				replacement: marklessPackage(webOrRuntimeRender),
			},
			{
				find: '@markless/runtime/render',
				replacement: marklessPackage(webOrRuntimeRender),
			},
			{
				find: '@markless/web/event-only-resume',
				replacement: marklessPackage(webOrRuntimeEventOnlyResume),
			},
			{
				find: '@markless/runtime/event-only-resume',
				replacement: marklessPackage(webOrRuntimeEventOnlyResume),
			},
			{
				find: '@markless/runtime',
				replacement: marklessPackage('packages/runtime/src/index.ts'),
			},
			{
				find: '@markless/core/preload',
				replacement: marklessPackage('packages/core/src/preload.ts'),
			},
			{
				find: '@markless/core/web/event-only-resume',
				replacement: marklessPackage(marklessWebOrRuntimeEventOnlyResume),
			},
			{
				find: '@markless/core/runtime/event-only-resume',
				replacement: marklessPackage(marklessWebOrRuntimeEventOnlyResume),
			},
			{
				// Keyed-row modules escalate the emitted browser entry to the
				// full resume runtime; without this alias the catch-all below
				// resolves index.ts + '/web/resume' (Not a directory).
				find: '@markless/core/web/resume',
				replacement: marklessPackage(marklessWebOrRuntimeResume),
			},
			{
				find: '@markless/core/runtime/resume',
				replacement: marklessPackage(marklessWebOrRuntimeResume),
			},
			{
				find: '@markless/core',
				replacement: marklessPackage('packages/core/src/index.ts'),
			},
			{
				find: '@markless/serializer',
				replacement: marklessPackage('packages/serializer/src/index.ts'),
			},
		],
	},
};

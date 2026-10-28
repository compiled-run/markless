import { expect, test } from 'vitest';
import { codePrefetchManifest, type PrefetchBundle } from './code-prefetch.ts';

const chunk = (fileName: string, facade: string | null, more: Partial<{ moduleIds: string[]; imports: string[]; dynamicImports: string[]; code: string }> = {}) => ({
	type: 'chunk' as const,
	fileName,
	facadeModuleId: facade,
	moduleIds: more.moduleIds ?? (facade ? [facade] : []),
	imports: more.imports ?? [],
	dynamicImports: more.dynamicImports ?? [],
	code: more.code ?? '',
});

const bundle: PrefetchBundle = {
	'build/session.js': chunk('build/session.js', '/src/session.ts', {
		imports: ['build/shared.js'],
		dynamicImports: ['build/editor.js'],
		code: 'new Worker(new URL("/assets/worker-1.js", import.meta.url))',
	}),
	'build/editor.js': chunk('build/editor.js', '/src/editor.ts', { imports: ['build/shared.js'] }),
	'build/shared.js': chunk('build/shared.js', null, { moduleIds: ['/src/util.ts'] }),
	'build/unrelated.js': chunk('build/unrelated.js', '/src/unrelated.ts'),
	'build/live.js': chunk('build/live.js', '/src/live.ts', { imports: ['build/shared.js'] }),
	'build/frame.js': chunk('build/frame.js', '/src/frame.ts', { imports: ['build/core.js', 'build/table.js'] }),
	'build/table.js': chunk('build/table.js', null, { moduleIds: ['/src/frame-runtime.ts'], dynamicImports: ['build/text.js', 'build/unused-runtime.js'] }),
	'build/unused-runtime.js': chunk('build/unused-runtime.js', '/pkg/unused.ts'),
	'build/core.js': chunk('build/core.js', null, { moduleIds: ['/pkg/core.ts'], dynamicImports: ['build/lazy.js'] }),
	'build/feature.js': chunk('build/feature.js', null, { moduleIds: ['/pkg/feature.ts'], code: 'run();setTimeout(()=>{for(const pack of[import("@markless/c/warm"),import("./near.js")])pack.catch(()=>{})});' }),
	'build/warm.js': chunk('build/warm.js', '/pkg/warm.ts'),
	'build/near.js': chunk('build/near.js', '/pkg/near.ts'),
	'build/lazy.js': chunk('build/lazy.js', '/pkg/lazy.ts'),
	'build/text.js': chunk('build/text.js', null, { moduleIds: ['/pkg/text.ts', '/pkg/text-helper.ts'], imports: ['build/core.js'] }),
	'assets/worker-1.js': { type: 'asset', fileName: 'assets/worker-1.js', source: 'const demo = "other.js";' },
	'assets/other.js': { type: 'asset', fileName: 'assets/other.js', source: '' },
};

const warmImports = (code: string) => [...code.matchAll(/import\("([^"]+)"\)/g)].map((match) => match[1]!);

test('a block downloads its boot modules, worker, frame with what its runtime loads lazily, the runtime chunks its own starter imports, and the packs those chunks warm a task after they run', () => {
	const manifest = codePrefetchManifest(bundle, {
		base: '/',
		sessionEntry: '/src/session.ts',
		liveEntry: '/src/live.ts',
		frameEntry: '/src/frame.ts',
		runtimeTable: '/src/frame-runtime.ts',
		frameFile: '/_code-frame.html',
		blocks: { counter: ['/pkg/text-helper.ts', '/pkg/core.ts'], theme: ['/pkg/feature.ts'] },
		warmImports,
		importMap: { '@markless/c/warm': '/build/warm.js' },
	});
	expect(manifest).toEqual({
		session: ['/build/editor.js', '/build/session.js', '/build/shared.js'],
		live: ['/build/live.js'],
		cache: ['/assets/worker-1.js', '/build/core.js', '/build/frame.js', '/build/lazy.js', '/build/table.js', '/_code-frame.html'],
		blocks: { counter: ['/build/text.js'], theme: ['/build/feature.js', '/build/near.js', '/build/warm.js'] },
	});
});

test('a runtime source no chunk holds fails the build instead of prefetching too little', () => {
	expect(() =>
		codePrefetchManifest(bundle, {
			base: '/',
			sessionEntry: '/src/session.ts',
			liveEntry: '/src/live.ts',
			frameEntry: '/src/frame.ts',
			runtimeTable: '/src/frame-runtime.ts',
			frameFile: '/_code-frame.html',
			blocks: { gone: ['/pkg/missing.ts'] },
			warmImports,
			importMap: {},
		}),
	).toThrow(/no built chunk holds \/pkg\/missing\.ts/);
});

test('a warmed pack the import map does not name fails the build instead of prefetching too little', () => {
	expect(() =>
		codePrefetchManifest(bundle, {
			base: '/',
			sessionEntry: '/src/session.ts',
			liveEntry: '/src/live.ts',
			frameEntry: '/src/frame.ts',
			runtimeTable: '/src/frame-runtime.ts',
			frameFile: '/_code-frame.html',
			blocks: { theme: ['/pkg/feature.ts'] },
			warmImports,
			importMap: {},
		}),
	).toThrow(/warms @markless\/c\/warm/);
});

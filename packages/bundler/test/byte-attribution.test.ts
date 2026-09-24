import { describe, expect, test } from 'vitest';
import {
	BYTE_CATEGORY,
	classifyShippedModule,
	collectRenderedModules,
	createByteAttributionAsset,
	MARKLESS_BYTE_ATTRIBUTION,
} from '../src/build/byte-attribution.ts';
import { MARKLESS_BUILD_METADATA_FILES } from '../src/build/chunking.ts';
import { stripBuildPrefix } from '../src/virtual-ids.ts';

const root = '/work/app';

describe('shipped module classification', () => {
	test.each([
		['/work/repo/packages/web/src/resume-branches.ts', 'runtime', 'web/resume-branches'],
		['/work/repo/packages/core/src/web/resume.ts', 'runtime', 'core/web/resume'],
		[
			'/work/app/node_modules/@markless/router/dist/link-resumer.js',
			'runtime',
			'router/link-resumer',
		],
		[
			'/work/repo/packages/serializer/src/protocol-client.ts',
			'runtime',
			'serializer/protocol-client',
		],
		['/work/app/pages/index.tsrx', 'author', 'pages/index.tsrx'],
		['/work/app/src/data.ts', 'author', 'src/data.ts'],
		['/work/app/pages/index.tsrx?markless-resume', 'glue', 'pages/index.tsrx?markless-resume'],
		[
			'\0virtual:markless:resolver:%2Fwork%2Fapp%2Fpages%2Findex.tsrx',
			'glue',
			'virtual:markless:resolver:pages/index.tsrx',
		],
		[
			'\0virtual:markless:symbol:%2Fwork%2Fapp%2Fpages%2Findex.tsrx:symbol%3A0',
			'author',
			'virtual:markless:symbol:pages/index.tsrx:symbol:0',
		],
		['\0rolldown/runtime.js', 'glue', 'rolldown/runtime.js'],
		[
			'\0virtual:markless:render-data:%2Fwork%2Fapp%2Fpages%2Findex.tsrx',
			'author',
			'virtual:markless:render-data:pages/index.tsrx',
		],
		[
			'/work/repo/packages/router/src/vite/entries/client-entry.ts?markless-router-root=%2Fwork%2Fapp&lang.ts',
			'runtime',
			'router/vite/entries/client-entry',
		],
		[
			'virtual:markless-router/options?markless-router-root=%2Fwork%2Fapp&lang.ts',
			'glue',
			'virtual:markless-router/options?markless-router-root',
		],
		[
			'/work/app/node_modules/.pnpm/urlpattern-polyfill@10.0.0/node_modules/urlpattern-polyfill/index.js',
			'third-party',
			'npm:urlpattern-polyfill',
		],
		['/work/app/node_modules/lodash-es/debounce.js', 'third-party', 'npm:lodash-es'],
		['/work/app/node_modules/@scope/pkg/index.js', 'third-party', 'npm:@scope/pkg'],
	])('%s is %s', (id, category, key) => {
		expect(classifyShippedModule(id, root)).toEqual({ category, key });
	});
});

describe('byte attribution asset', () => {
	test('records every chunk module with its category and rendered length', () => {
		const chunk = {
			type: 'chunk' as const,
			fileName: 'build/chunk-a.js',
			name: 'a',
			code: 'x'.repeat(90),
			exports: [],
			imports: [],
			dynamicImports: [],
			moduleIds: [],
			modules: {
				'/work/app/pages/index.tsrx': { renderedLength: 30 },
				'/work/repo/packages/web/src/resume-runtime.ts': { renderedLength: 50 },
				'/work/repo/packages/web/src/empty.ts': { renderedLength: 0 },
			},
		};
		const bundle = { 'build/chunk-a.js': chunk };

		const asset = createByteAttributionAsset(
			bundle,
			collectRenderedModules(bundle),
			root,
			stripBuildPrefix,
		);

		expect(asset.fileName).toBe(MARKLESS_BYTE_ATTRIBUTION);
		expect(JSON.parse(asset.source)).toEqual({
			version: 1,
			chunks: {
				'chunk-a.js': {
					bytes: 90,
					modules: [
						[BYTE_CATEGORY.author, 'pages/index.tsrx', 30],
						[BYTE_CATEGORY.runtime, 'web/resume-runtime', 50],
					],
				},
			},
		});
	});

	test('hosts revalidate it like the other fixed-name build metadata', () => {
		expect(MARKLESS_BUILD_METADATA_FILES).toContain(MARKLESS_BYTE_ATTRIBUTION);
	});
});

import { docsData } from './tooling/docs-data.ts';
import { errors } from './tooling/errors.ts';
import { markless } from '@markless/core/vite';
import { ui } from '@markless/ui/vite';
import { router } from '@markless/router/vite';
import type { UserConfig } from 'vite';
import type { NitroConfig } from 'nitro/types';
import type { OxlintConfig } from 'oxlint';
import { highlightMdx } from './tooling/highlight-mdx.ts';
import { uiDemos } from './tooling/ui-demos.ts';
import { pageProps } from './tooling/page-props.ts';
import { anatomy } from './tooling/anatomy.ts';
import { keyboard } from './tooling/keyboard.ts';
import { codeBlocks } from './tooling/code-blocks.ts';
import { codeClient } from './tooling/code-client.ts';
import { siteBase } from './site-base.ts';

export default {
	base: siteBase,
	nitro: { baseURL: siteBase },
	// Measured: /concepts/state is 854 kB in the browser and 914 kB on the server, 487 kB of it drawing data.
	build: { chunkSizeWarningLimit: 1000 },
	// pageProps, codeBlocks and uiDemos run before router(): they rewrite the .mdx source router() parses.
	// highlightMdx runs after router(): it rewrites the module router() emits.
	lint: {
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: '@markless/ui',
							importNames: ['*'],
							allowTypeImports: true,
							message: "import { family } from '@markless/ui'",
						},
					],
					patterns: [
						{
							group: ['@markless/ui/*', '!@markless/ui/vite'],
							allowTypeImports: true,
							message: "import { family } from '@markless/ui'",
						},
					],
				},
			],
		},
	},
	plugins: [
		errors(),
		ui(),
		pageProps(),
		codeBlocks(),
		codeClient(),
		docsData(),
		uiDemos(),
		anatomy(),
		keyboard(),
		markless(),
		router(),
		highlightMdx(),
	],
} satisfies UserConfig & { nitro: NitroConfig; lint: OxlintConfig };

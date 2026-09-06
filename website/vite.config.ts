import { markless } from '@markless/core/vite';
import { ui } from '@markless/ui/vite';
import { router } from '@markless/router/vite';
import type { UserConfig } from 'vite';
import type { NitroConfig } from 'nitro/types';
import type { OxlintConfig } from 'oxlint';
import { highlightMdx } from './tooling/highlight-mdx.ts';
import { uiDemos } from './tooling/ui-demos.ts';

export default {
	base: '/markless/',
	nitro: { baseURL: '/markless/' },
	// uiDemos runs before router(): it rewrites the .mdx source router() parses.
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
	plugins: [ui(), uiDemos(), markless(), router(), highlightMdx()],
} satisfies UserConfig & { nitro: NitroConfig; lint: OxlintConfig };

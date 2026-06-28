import { describe, expect, it } from 'vite-plus/test';
import { transformMdxRoute } from '../../src/vite/mdx.ts';

describe('Arcade Router MDX transform', () => {
	it('turns static markdown route content into an Arcade SSR artifact', async () => {
		const code = await transformMdxRoute(
			`# Docs

This page is static markdown.
`,
			'/project/pages/docs.mdx',
		);

		expect(code).toContain('renderSsr()');
		expect(code).toContain('<h1>Docs</h1>');
		expect(code).toContain('<p>This page is static markdown.</p>');
		expect(code).toContain('export default arcadeMdxPage');
	});

	it('rejects composed MDX until full MDX support is ported', async () => {
		await expect(
			transformMdxRoute(
				`<main><Content /></main>

--- content

# Body
`,
				'/project/pages/docs.mdx',
			),
		).rejects.toThrow('Arcade Router MDX support is limited to static markdown today');
	});
});

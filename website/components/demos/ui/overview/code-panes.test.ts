import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codePane } from '../../../../tooling/code-blocks.ts';

const here = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

/** A demo file as its code band shows it: without the `<style>` block that only dresses the demo. */
function shown(source: string): string {
	return source.replace(/\n[ \t]*<style>[\s\S]*?<\/style>/g, '');
}

const SOURCES = {
	editAddress: [{ name: 'edit-address.tsrx', code: shown(here('./edit-address.tsrx')) }],
};

describe('ui overview preview code bands', () => {
	it('show the demo files, highlighted (run with -u after editing a demo)', async () => {
		const blocks: string[] = [];
		for (const [name, files] of Object.entries(SOURCES)) {
			const panes = await Promise.all(files.map((file, index) => codePane(file, index)));
			blocks.push(`export const ${name}: readonly PreviewFile[] = ${JSON.stringify(panes)};`);
		}
		const module = `// Written by code-panes.test.ts from the demo files beside it. Run \`vp test -u\` to refresh.
import type { PreviewFile } from '../../../docs/preview-card.tsrx';

${blocks.join('\n\n')}
`;
		await expect(module).toMatchFileSnapshot('./code-panes.ts');
	}, 30_000);
});

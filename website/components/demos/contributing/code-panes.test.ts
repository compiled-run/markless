import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codePane } from '../../../tooling/code-blocks.ts';

const here = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

/** A demo file as its code band shows it: without the `<style>` block that only dresses the demo. */
function shown(source: string): string {
	return source.replace(/\n[ \t]*<style>[\s\S]*?<\/style>/g, '');
}

/** The wrapper as a contributor would write it: the Part names switch is this card's own lesson. */
const TYPO_COUNT_DEMO = `import PreviewCard, { Controls, Stage, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { typoCount } from './code-panes.ts';
import TypoCount from './typo-count.tsrx';

export default function TypoCountDemo() @{
	<PreviewCard name="typo-count" label="A demo and the card around it">
		<Controls title="A demo is two files" />
		<Stage>
			<TypoCount />
		</Stage>
		<Watch>typo-count.tsrx made the button. typo-count-demo.tsrx made this card around it.</Watch>
		<Code files={typoCount} />
	</PreviewCard>
}
`;

const SOURCES = {
	typoCount: [
		{ name: 'typo-count.tsrx', code: shown(here('./typo-count.tsrx')) },
		{ name: 'typo-count-demo.tsrx', code: TYPO_COUNT_DEMO },
	],
};

describe('contributing preview code bands', () => {
	it('show the demo files, highlighted (run with -u after editing a demo)', async () => {
		const blocks: string[] = [];
		for (const [name, files] of Object.entries(SOURCES)) {
			const panes = await Promise.all(files.map((file, index) => codePane(file, index)));
			blocks.push(`export const ${name}: readonly PreviewFile[] = ${JSON.stringify(panes)};`);
		}
		const module = `// Written by code-panes.test.ts from the demo files beside it. Run \`vp test -u\` to refresh.
import type { PreviewFile } from '../../docs/preview-card.tsrx';

${blocks.join('\n\n')}
`;
		await expect(module).toMatchFileSnapshot('./code-panes.ts');
	}, 30_000);

	it('keep the wrapper band true to the card it describes', () => {
		const card = here('./typo-count-demo.tsrx');
		for (const part of ['<Controls title="A demo is two files">', '<TypoCount />', '<Code files={typoCount} />'])
			expect(card).toContain(part);
	});
});

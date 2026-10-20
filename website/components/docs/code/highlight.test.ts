import { describe, expect, it } from 'vitest';
import { codePane } from '../../../tooling/code-blocks.ts';
import { loadHighlighter } from './highlight.ts';

const counter = `import { state } from '@markless/core';

export default function Counter() @{
	let count = state(0);

	<>
		<button onClick={() => count++}>Count {count}</button>
		@if (count > 2) {
			<p class="many">That's {count}.</p>
		}
		<style>.many { color: teal; }</style>
	</>
}
`;

function decode(text: string): string {
	return text.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, body: string) => {
		if (body[0] === '#')
			return String.fromCodePoint(
				body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number(body.slice(1)),
			);
		return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[body.toLowerCase()] ?? body;
	});
}

/** One `char:style` per visible character, so two highlighters compare however they split runs. */
function painted(runs: readonly { readonly text: string; readonly style?: string }[]): string[] {
	return runs.flatMap((run) =>
		[...run.text].filter((char) => char.trim()).map((char) => `${char}:${run.style ?? ''}`),
	);
}

function runsOf(markup: string): { text: string; style?: string }[] {
	return [...markup.matchAll(/<span style="([^"]*)">([^<]*)<\/span>|([^<]+)/g)].map((match) =>
		match[3] === undefined
			? { text: decode(match[2]!), style: match[1] }
			: { text: decode(match[3]) },
	);
}

describe('browser highlighter', () => {
	it('paints each line of a .tsrx file as the build does, and returns one entry per line', async () => {
		const highlighter = await loadHighlighter();
		const pane = await codePane({ name: 'counter.tsrx', code: counter });
		const lines = highlighter.lines(pane.code, 'counter.tsrx');
		expect(lines).toHaveLength(pane.code.split('\n').length);
		expect(lines.map((line) => painted(runsOf(line)))).toEqual(
			pane.lines.map((line) => painted(line.runs)),
		);
	});

	it('keeps a trailing empty line, so a new last line has a row under the caret', async () => {
		const highlighter = await loadHighlighter();
		expect(highlighter.lines('a\n', 'x.ts')).toHaveLength(2);
	});
});

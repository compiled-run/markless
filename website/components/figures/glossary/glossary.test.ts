import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawing, MEANING, PAGES, TERM } from './term.ts';

const art = drawing();
const page = (path: string) => readFileSync(new URL('../../../' + path, import.meta.url), 'utf8').replace(/`|\*\*/g, '');
const glossary = readFileSync(new URL('../../../pages/reference/glossary.mdx', import.meta.url), 'utf8');

describe('glossary term figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});

	it('is frozen (refresh with -u after a geometry change)', async () => {
		const module = `// Written by glossary.test.ts from term.ts. Refresh with the figure tests and -u.
import type { drawing } from './term.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./term.art.ts');
	});

	it("shows the glossary's one meaning for the term", () => {
		expect(glossary).toContain('| ' + TERM + ' | ' + MEANING + ' |');
	});

	it('quotes each page word for word, from two different sections', () => {
		for (const p of PAGES) {
			const sentence = p.lines.map((line) => line.before + line.term + line.after).join(' ');
			expect(page(p.source).replace(/\s+/g, ' ')).toContain(sentence);
		}
		expect(new Set(PAGES.map((p) => p.source.split('/')[1]))).toEqual(new Set(['how-it-works', 'contributing']));
	});

	it('gives both pages the very same tooltip text', () => {
		const words = (i: number) => art.pages[i]!.tip.texts.map((t) => t.text);
		expect(words(0)).toEqual(words(1));
	});
});

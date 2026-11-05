import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { drawing, EXTENSION, HEADING, LINES, TYPO } from './editor.ts';

const art = drawing();
const D = (ts as unknown as { Diagnostics: Record<string, { code: number; message: string }> }).Diagnostics;
const recommended = JSON.parse(readFileSync(new URL('../../../../packages/cli/templates/common/.vscode/extensions.json', import.meta.url), 'utf8')) as { recommendations: string[] };
const text = (runs: { t: string }[]) => runs.map((r) => r.t).join('');
const texts = (part: { layers: { texts: { text: string }[] }[] }) => part.layers.flatMap((l) => l.texts.map((t) => t.text));

describe('editor setup figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});

	it('is frozen (refresh with -u after a geometry change)', async () => {
		const module = `// Written by editor-setup.test.ts from editor.ts. Refresh with the figure tests and -u.
import type { drawing } from './editor.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./editor.art.ts');
	});

	it('lists the extension a new app recommends', () => {
		expect(recommended.recommendations).toContain(EXTENSION.id);
		expect(EXTENSION.id.startsWith(EXTENSION.publisher + '.')).toBe(true);
		expect(texts(art.base)).toEqual(expect.arrayContaining([EXTENSION.name, EXTENSION.publisher, 'profile.tsrx']));
	});

	// TYPO came from running packages/typescript-plugin/src/tsc.ts on this profile.tsrx with {nmae}.
	it('shows the message TypeScript prints for the typo', () => {
		expect(TYPO).toEqual({ code: D.Cannot_find_name_0!.code, message: D.Cannot_find_name_0!.message.replace('{0}', 'nmae') });
		expect(text(HEADING.typo)).toContain('{nmae}');
		expect(LINES.map(text).join('\n')).toContain("let name = state('Ada');");
		expect(LINES.map(text).join('\n')).not.toMatch(/count|cart|weather/i);
	});
});

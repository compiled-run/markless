import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { drawing, EXTENSION, HEADING, HINTS, LINES, MATCHES, TYPO } from './editor.ts';

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
		expect(texts(art.base)).toContain('profile.tsrx');
		expect(texts(art.listing)).toEqual(expect.arrayContaining([EXTENSION.name, EXTENSION.publisher, EXTENSION.installs, EXTENSION.description.slice(0, 21) + '…']));
		expect(texts(art.empty)).toEqual(['No extensions found.']);
	});

	it('matches searches the way the listing does: ts and tsrx find it, other words do not', () => {
		for (const q of ['ts', 'tsrx', 'TSRX', 'ripple']) expect(MATCHES.includes(q.toLowerCase())).toBe(true);
		for (const q of ['python', 'vue', 'zzz']) expect(MATCHES.includes(q)).toBe(false);
		expect(Object.keys(HINTS)).toEqual(['search', 'install', 'hover', 'typo']);
		expect(art.rings.search.layers.length).toBeGreaterThan(0);
	});

	// TYPO came from running packages/typescript-plugin/src/tsc.ts on this profile.tsrx with {nmae}.
	it('shows the message TypeScript prints for the typo', () => {
		expect(TYPO).toEqual({ code: D.Cannot_find_name_0!.code, message: D.Cannot_find_name_0!.message.replace('{0}', 'nmae') });
		expect(text(HEADING.typo)).toContain('{nmae}');
		expect(LINES.map(text).join('\n')).toContain("let name = state('Ada');");
		expect(LINES.map(text).join('\n')).not.toMatch(/count|cart|weather/i);
	});
});

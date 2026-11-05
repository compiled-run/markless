import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { drawing, ERRORS, VARIANTS } from './editor.ts';

const art = drawing();
const page = readFileSync(new URL('../../../pages/tooling/type-checking.mdx', import.meta.url), 'utf8');
const D = (ts as unknown as { Diagnostics: Record<string, { code: number; message: string }> }).Diagnostics;
const fill = (template: string, ...args: string[]) => args.reduce((text, arg, i) => text.replace('{' + i + '}', arg), template);
const text = (runs: { t: string }[]) => runs.map((r) => r.t).join('');

describe('type checking figure', () => {
	it('draws the same scene twice', () => {
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(art));
	});

	it('is frozen (refresh with -u after a geometry change)', async () => {
		const module = `// Written by type-checking.test.ts from editor.ts. Refresh with the figure tests and -u.
import type { drawing } from './editor.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(art, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./editor.art.ts');
	});

	// The values came from running packages/typescript-plugin/src/tsc.ts on this card.tsrx and avatar.tsrx.
	it('shows the messages TypeScript prints for these two mistakes', () => {
		expect(ERRORS.size).toMatchObject({ code: D.Type_0_is_not_assignable_to_type_1!.code, message: fill(D.Type_0_is_not_assignable_to_type_1!.message, 'string', 'number') });
		expect(ERRORS.titel).toMatchObject({ code: D.Cannot_find_name_0_Did_you_mean_1!.code, message: fill(D.Cannot_find_name_0_Did_you_mean_1!.message, 'titel', 'title') });
		expect(text(VARIANTS.size.wrong)).toContain('<Avatar size="large" />');
		expect(text(VARIANTS.titel.wrong)).toContain('{titel}');
	});

	it('quotes the same messages on the page, with no internals', () => {
		expect(page).toContain(ERRORS.size.message);
		expect(page).toContain(ERRORS.titel.message);
		expect(page).not.toMatch(/TSX copy|type service|emit/i);
	});
});

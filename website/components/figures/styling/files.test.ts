import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { describeRepaint, nextColour, scopeOf, SCOPES, scrub } from './files-model.ts';
import { drawing } from './files.ts';

const filesArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/styling.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./files-anatomy.tsrx', import.meta.url), 'utf8');
const scopes = readFileSync(new URL('../../../../packages/compiler/src/passes/public-render/style-scopes.ts', import.meta.url), 'utf8');

describe('two files that both style .card', () => {
	it('hashes each file the way the compiler does', () => {
		expect(scopes).toContain('return `mk-${hash.toString(36)}`;');
		expect(scopeOf('src/a.tsrx')).toMatch(/^mk-[0-9a-z]+$/);
		expect(SCOPES[0]).not.toBe(SCOPES[1]);
	});

	it('steps and scrubs colours, and says which cards changed', () => {
		expect(nextColour(4)).toBe(0);
		expect(scrub(0, 100, 150)).toBe(2);
		expect(describeRepaint(0, 1)).toBe('ProfileCard.tsrx painted its own .card sage. The other card, same class name, stayed put.');
		expect(describeRepaint('global', 3)).toBe('global.css now paints every .card sky: both cards changed.');
	});

	it('paints each card from its own file unless the rule moved to global.css', () => {
		expect(piece).toContain("const paint0 = computed(() => 'fill: ' + COLOURS[shared ? cg : c0]);");
		expect(piece).toContain("const paint1 = computed(() => 'fill: ' + COLOURS[shared ? cg : c1]);");
		expect(piece).toContain('<p class="hover-line" aria-hidden="true">');
		expect(piece).toContain('aria-live="polite"');
	});

	it('draws the same frames every time', () => {
		expect(filesArt.files).toHaveLength(3);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(filesArt));
	});

	it('is on the Styling page under its own heading', () => {
		expect(page).toContain("import FilesAnatomy from '../../components/figures/styling/files-anatomy.tsrx';");
		expect(page.indexOf('## Same name, different file')).toBeLessThan(page.indexOf('<FilesAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by files.test.ts from files.ts. Run the figure tests with -u to refresh.
import type { drawing } from './files.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(filesArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./files.art.ts');
	});
});

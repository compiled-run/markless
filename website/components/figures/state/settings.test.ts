import { readFileSync } from 'node:fs';
import { describe as group, expect, it } from 'vitest';
import { describe, drawing, times } from './settings.ts';

const drawn = drawing();
const page = readFileSync(new URL('../../../pages/concepts/state.mdx', import.meta.url), 'utf8');
const demo = readFileSync(new URL('./settings-demo.tsrx', import.meta.url), 'utf8');

group('the settings demo', () => {
	it('says what changed and how often each function ran', () => {
		expect(describe('dark', 1)).toBe('Theme is dark. The page colours, the heading and the picture changed together. Settings() ran once; the handler ran 1 time.');
		expect(times(3)).toBe('3 times');
	});

	it('shows theme in the same three spots as the code sample', () => {
		const sample = page.slice(page.indexOf('```tsrx title="settings.tsrx"'));
		for (const spot of ['class={theme}', '<h2>Theme: {theme}</h2>', "{theme === 'dark' ? '🌙' : '☀️'}", "onClick={() => (theme = 'light')}", "onClick={() => (theme = 'dark')}"]) expect(sample).toContain(spot);
		expect(demo).toContain("let theme = state<Theme>('light')");
		expect(demo).toContain('Theme: {theme}');
		expect(demo).toContain("{theme === 'dark' ? '🌙' : '☀️'}");
		expect(page).toContain('<SettingsDemo />');
	});

	it('draws the sun and the moon', () => {
		for (const part of [drawn.sun.disc, drawn.sun.ink, drawn.moon.disc, drawn.moon.ink, drawn.moon.shade]) expect(part.length).toBeGreaterThan(20);
	});
});

group('frozen art', () => {
	it('matches the generator (run with -u after changing settings.ts)', async () => {
		const module = `// Written by settings.test.ts from settings.ts. Run \`vp test -u\` to refresh.
import type { drawing } from './settings.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(drawn, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./settings.art.ts');
	});
});

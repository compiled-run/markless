import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CITIES, claim, describeWeather, isNewest } from './weather-model.ts';
import { drawing } from './weather.ts';

const weatherArt = drawing();
const page = readFileSync(new URL('../../../pages/concepts/async.mdx', import.meta.url), 'utf8');
const piece = readFileSync(new URL('./weather-anatomy.tsrx', import.meta.url), 'utf8');

describe('the weather card', () => {
	it('keeps only the newest pick, and says what happened', () => {
		expect(CITIES.map((c) => c.name)).toEqual(['Oslo', 'Lisbon', 'Tokyo']);
		const first = claim();
		const second = claim();
		expect([isNewest(first), isNewest(second)]).toEqual([false, true]);
		expect(describeWeather('dropped', 'Lisbon')).toBe("Lisbon's answer came back after a newer pick, so it was thrown away.");
	});

	it('pencils the first load, fades the old forecast on refresh, and throws away a stale answer', () => {
		expect(piece).toContain(".scene[data-stage='first'] .pencil-dots");
		expect(piece).toContain(".scene[data-stage='refresh'] .today");
		expect(piece).toContain('if (isNewest(mine)) {');
		expect(piece).toContain('this pencil is <code>@pending</code>');
		expect(piece.match(/role="tab"/g)).toHaveLength(3);
		expect(piece).not.toMatch(/class="cord"|art\.wires/);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same card every time', () => {
		expect(weatherArt.tabs).toHaveLength(3);
		expect(weatherArt.card.ink.length).toBeGreaterThan(300);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(weatherArt));
	});

	it('is on the Async page under its own heading', () => {
		expect(page).toContain("import WeatherAnatomy from '../../components/figures/async/weather-anatomy.tsrx';");
		expect(page.indexOf('## Pick a city')).toBeLessThan(page.indexOf('<WeatherAnatomy />'));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by weather.test.ts from weather.ts. Run the figure tests with -u to refresh.
import type { drawing } from './weather.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(weatherArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./weather.art.ts');
	});
});

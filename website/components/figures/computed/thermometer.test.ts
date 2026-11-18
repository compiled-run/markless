import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adviceOf, clampC, describeChain, dial, fahrenheitOf, mercuryTop, START, TUBE } from './thermometer-model.ts';
import { drawing } from './thermometer.ts';

const thermometerArt = drawing();
const piece = readFileSync(new URL('./thermometer-anatomy.tsrx', import.meta.url), 'utf8');

describe('a thermometer, its °F tag and an advice sign', () => {
	it('works °F out from °C and the advice out from °F', () => {
		expect(START).toBe(5);
		expect(fahrenheitOf(5)).toBe(41);
		expect(fahrenheitOf(3)).toBe(37.4);
		expect(adviceOf(49.9)).toBe('Bring a coat');
		expect(adviceOf(50)).toBe('No coat');
		expect(clampC(80)).toBe(35);
		expect(dial(5, 100, 90)).toBe(7);
		expect(mercuryTop(-10)).toBe(TUBE.bottom);
		expect(mercuryTop(35)).toBe(TUBE.top);
		expect(describeChain(10, true)).toBe('10°C is 50°F, which crossed 50, so the sign flips to No coat.');
	});

	it('chains two computeds and never writes either one', () => {
		expect(piece).toContain('const fahrenheit = computed(() => fahrenheitOf(celsius));');
		expect(piece).toContain('const advice = computed(() => adviceOf(fahrenheit));');
		expect(piece).not.toMatch(/(?<!const )\b(fahrenheit|advice)\s*=[^=>]/);
		expect(piece.match(/role="slider"/g)).toHaveLength(1);
		expect(piece).toContain('aria-live="polite"');
		expect(piece).toContain('prefers-reduced-motion: reduce');
	});

	it('draws the same scene every time, with five scale labels', () => {
		expect(thermometerArt.thermometer.labels).toHaveLength(5);
		expect(JSON.stringify(drawing())).toBe(JSON.stringify(thermometerArt));
	});
});

describe('frozen art', () => {
	it('freezes the drawing into a plain-data module the compiler can read (run with -u after editing)', async () => {
		const module = `// Written by thermometer.test.ts from thermometer.ts. Run the figure tests with -u to refresh.
import type { drawing } from './thermometer.ts';

export const art: ReturnType<typeof drawing> = ${JSON.stringify(thermometerArt, null, '\t')};
`;
		await expect(module).toMatchFileSnapshot('./thermometer.art.ts');
	});
});

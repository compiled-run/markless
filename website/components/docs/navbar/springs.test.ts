import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOVER, SLIDE, settleMs, springEasing } from './springs.ts';

const css = readFileSync(new URL('./site-navbar.tsrx', import.meta.url), 'utf8');

describe('navbar springs', () => {
	it('settle the slide in under half a second, with at most a whisker of overshoot', () => {
		expect(settleMs(SLIDE)).toBeLessThan(500);
		const values = springEasing(SLIDE).slice(7, -1).split(', ').map((stop) => Number(stop.split(' ')[0]));
		expect(Math.max(...values)).toBeLessThan(1.01);
	});

	// The CSS cannot import a module, so the generated easings are pasted into it and this keeps them true.
	it('match the easings written into the navbar stylesheet', () => {
		expect(css).toContain(`--spring-slide: ${springEasing(SLIDE)};`);
		expect(css).toContain(`--spring-slide-ms: ${settleMs(SLIDE)}ms;`);
		expect(css).toContain(`--spring-hover: ${springEasing(HOVER)};`);
		expect(css).toContain(`--spring-hover-ms: ${settleMs(HOVER)}ms;`);
	});
});

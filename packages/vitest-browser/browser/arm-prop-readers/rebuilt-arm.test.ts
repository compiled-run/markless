import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { resetLogs } from './api.ts';
import RebuiltOpenPage from './rebuilt-open-page.tsrx';
import RebuiltPage from './rebuilt-closed-page.tsrx';

// An owner rebuilt under the same instance path keeps reading its props where they live, whatever another arm notes later.
// Known defect, not the live routes': main and #682 fail identically (the derive reads NaN and the rebuilt arm stops following writes).
beforeEach(resetLogs);
afterEach(cleanup);

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? null;
const pages = {
	opened: { CSR: () => render(RebuiltPage), SSR: () => renderSSR(RebuiltPage) },
	openAtLoad: { CSR: () => render(RebuiltOpenPage), SSR: () => renderSSR(RebuiltOpenPage) },
};

for (const mode of ['CSR', 'SSR'] as const)
	for (const [shape, page] of [
		['opened by a click', pages.opened],
		['open when the owner renders', pages.openAtLoad],
	] as const)
		test.fails(`${mode}, inner arm ${shape}: after the outer arm is rebuilt and another arm opens, a write reaches the rebuilt owner's arm`, async () => {
			await page[mode]();
			if (shape === 'opened by a click') click('[data-moved] [data-open]');
			await expect.poll(() => text('[data-moved] [data-text]')).toBe('1');
			click('[data-outer]');
			await expect.poll(() => document.querySelector('[data-moved]')).toBeNull();
			click('[data-outer]');
			await expect.poll(() => document.querySelector('[data-moved] [data-open]')).not.toBeNull();
			if (shape === 'opened by a click') click('[data-moved] [data-open]');
			await expect.poll(() => text('[data-moved] [data-text]')).toBe('1');
			click('[data-still] [data-open]');
			await expect.poll(() => text('[data-still] [data-text]')).toBe('1');
			click('[data-bump]');
			await expect.poll(() => text('[data-still] [data-text]')).toBe('2');
			await expect.poll(() => [text('[data-moved] [data-text]'), text('[data-moved] [data-doubled]')]).toEqual(['2', '4']);
		});

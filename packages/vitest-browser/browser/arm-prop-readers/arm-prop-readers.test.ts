import { afterEach, beforeEach, expect, onTestFinished, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { derives, loads, resetLogs } from './api.ts';
import ArmOpenPage from './arm-open-page.tsrx';
import ArmPage from './arm-page.tsrx';
import DirectPage from './direct-page.tsrx';
import PropArmOpenPage from './prop-arm-open-page.tsrx';
import PropArmPage from './prop-arm-page.tsrx';
import ForwardArmOpenPage from './forward-arm-open-page.tsrx';
import ForwardArmPage from './forward-arm-page.tsrx';
import NestedArmPage from './nested-arm-page.tsrx';
import OtherPropArmPage from './other-prop-arm-page.tsrx';
import TryArmPage from './try-arm-page.tsrx';

// What every reader of one prop sees, in each place a component can stand: the text, an attribute, an @if test, a @for,
// a sync and an async computed, a handler and a child's prop all follow the owner's value, and a closed arm runs nothing.
beforeEach(resetLogs);
afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const readers = () =>
	document.querySelector('[data-reader]')
		? {
				attribute: document.querySelector('[data-reader]')!.getAttribute('data-value'),
				text: text('[data-text]'),
				test: text('[data-big]'),
				rows: [...document.querySelectorAll('[data-reader] li')].map((row) => row.textContent).join(','),
				sync: text('[data-doubled]'),
				async: text('[data-loaded]'),
				handler: text('[data-seen]'),
				child: text('[data-leaf]'),
			}
		: null;
const expected = (value: number, seen = -1) => ({
	attribute: String(value),
	text: String(value),
	test: value > 1 ? 'big' : 'small',
	rows: Array.from({ length: value }, (_, at) => at + 1).join(','),
	sync: String(value * 2),
	async: `loaded ${value}`,
	handler: String(seen),
	child: String(value),
});
// Later passes would have run any derive or load the step let through.
async function passes() {
	for (let at = 0; at < 3; at++) await new Promise((resolve) => setTimeout(resolve, 0));
}

async function followsAndReads(first: number) {
	await expect.poll(readers).toEqual(expected(first));
	click('[data-bump]');
	await expect.poll(readers).toEqual(expected(first + 1));
	click('[data-read]');
	await expect.poll(readers).toEqual(expected(first + 1, first + 1));
}

// What a known defect throws outside the test, kept so it fails the test rather than the run.
function pageErrors(): unknown[] {
	const errors: unknown[] = [];
	const onError = (event: ErrorEvent) => (errors.push(event.error), event.preventDefault());
	const onRejection = (event: PromiseRejectionEvent) => (errors.push(event.reason), event.preventDefault());
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	onTestFinished(() => {
		window.removeEventListener('error', onError);
		window.removeEventListener('unhandledrejection', onRejection);
	});
	return errors;
}

type Mode = 'CSR' | 'SSR';
// renderSSR takes its component literally, so each page spells both mounts.
const pages = {
	direct: { CSR: () => render(DirectPage), SSR: () => renderSSR(DirectPage) },
	arm: { CSR: () => render(ArmPage), SSR: () => renderSSR(ArmPage) },
	armOpen: { CSR: () => render(ArmOpenPage), SSR: () => renderSSR(ArmOpenPage) },
	forwardArm: { CSR: () => render(ForwardArmPage), SSR: () => renderSSR(ForwardArmPage) },
	forwardArmOpen: { CSR: () => render(ForwardArmOpenPage), SSR: () => renderSSR(ForwardArmOpenPage) },
	propArm: { CSR: () => render(PropArmPage), SSR: () => renderSSR(PropArmPage) },
	propArmOpen: { CSR: () => render(PropArmOpenPage), SSR: () => renderSSR(PropArmOpenPage) },
	otherPropArm: { CSR: () => render(OtherPropArmPage), SSR: () => renderSSR(OtherPropArmPage) },
	tryArm: { CSR: () => render(TryArmPage), SSR: () => renderSSR(TryArmPage) },
	nestedArm: { CSR: () => render(NestedArmPage), SSR: () => renderSSR(NestedArmPage) },
} satisfies Record<string, Record<Mode, () => Promise<unknown>>>;

for (const mode of ['CSR', 'SSR'] as const) {
	test(`${mode}: placed directly, every reader follows the prop`, async () => {
		await pages.direct[mode]();
		await followsAndReads(1);
		// A served value is not loaded or derived again in the browser.
		const first = mode === 'SSR' ? [2] : [1, 2];
		expect({ loads, derives }).toEqual({ loads: first, derives: first });
	});

	// An arm opened by a click derives its sync value once as it opens.
	const opened = { loads: [1, 2, 3], derives: [1, 2, 3] };
	const openAtFirst = mode === 'SSR' ? { loads: [2, 3], derives: [2, 3] } : { loads: [1, 2, 3], derives: [1, 2, 3] };
	for (const [shape, page, openAtLoad, logs] of [
		['a click-opened arm', pages.arm, false, opened],
		['an arm open at load', pages.armOpen, true, openAtFirst],
		['a click-opened arm behind a forward-only parent', pages.forwardArm, false, opened],
		['an arm open at load behind a forward-only parent', pages.forwardArmOpen, true, openAtFirst],
	] as const)
		test(`${mode}: in ${shape}, every reader follows the prop, a closed arm runs nothing, and a reopen starts over`, async () => {
			await page[mode]();
			if (!openAtLoad) {
				expect(readers()).toBeNull();
				click('[data-open]');
			}
			await followsAndReads(1);
			click('[data-close]');
			await expect.poll(readers).toBeNull();
			const ran = { loads: [...loads], derives: [...derives] };
			click('[data-bump]');
			await passes();
			expect({ loads, derives }, 'nothing runs while the arm is closed').toEqual(ran);
			click('[data-open]');
			await expect.poll(readers).toEqual(expected(3));
			click('[data-read]');
			await expect.poll(readers).toEqual(expected(3, 3));
			expect({ loads, derives }).toEqual(logs);
		});

	// An arm the browser renders for an owner that shares its file with the component that placed it reads that
	// component's values where they stand on the page.
	for (const [shape, page, openAtLoad] of [
		['a click-opened arm whose owner shares a file with what placed it', pages.propArm, false],
		['an arm open at load, reopened, whose owner shares a file with what placed it', pages.propArmOpen, true],
	] as const)
		test(`${mode}: in ${shape}, every reader follows the prop`, async () => {
			await page[mode]();
			if (openAtLoad) {
				click('[data-close]');
				await expect.poll(readers).toBeNull();
			}
			click('[data-open]');
			await followsAndReads(1);
		});

	// Known defect: the owner's routed props are not on the page when its arm sits in its own @try, so the arm's DOM
	// updates find no `prop:props` node and the arm never shows.
	test.fails(`${mode}: in an arm inside its owner's @try, whose owner shares a file with what placed it, every reader follows the prop`, async () => {
		const errors = pageErrors();
		await pages.tryArm[mode]();
		click('[data-open]');
		await followsAndReads(1);
		expect(errors).toEqual([]);
	});

	test(`${mode}: in an arm whose owner a second component of its file places, every reader follows the prop`, async () => {
		const errors = pageErrors();
		await pages.otherPropArm[mode]();
		click('[data-open]');
		await followsAndReads(1);
		expect(errors).toEqual([]);
	});

	// Known defect: an arm drawn in the browser inside another one routes its owner's props only as far as the outer
	// arm's owner, which its file placed, so committing it finds no `prop:props` node and its readers stop following.
	test.fails(`${mode}: in an arm whose owner stands in another arm, both placed in one file, every reader follows the prop`, async () => {
		const errors = pageErrors();
		await pages.nestedArm[mode]();
		click('[data-open-outer]');
		await expect.poll(() => document.querySelector('[data-open]')).not.toBeNull();
		click('[data-open]');
		await followsAndReads(1);
		expect(errors).toEqual([]);
	});
}

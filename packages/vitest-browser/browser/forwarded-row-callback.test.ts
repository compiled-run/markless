import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import GuardedForwarded from './forwarded-row-callback/guarded-forwarded.tsrx';
import GuardedRenamed from './forwarded-row-callback/guarded-renamed.tsrx';
import GuardedRow from './forwarded-row-callback/guarded-row.tsrx';
import OneLevel from './forwarded-row-callback/one-level.tsrx';
import ThreeLevels from './forwarded-row-callback/three-levels.tsrx';
import TwoLevels from './forwarded-row-callback/two-levels.tsrx';

// A callback prop a component forwards into its keyed rows' imported children runs for the row clicked.
afterEach(cleanup);

async function withoutPageErrors(run: () => Promise<void>) {
	const errors: unknown[] = [];
	const onError = (event: ErrorEvent) => errors.push(event.error ?? event.message);
	window.addEventListener('error', onError);
	try {
		await run();
		expect(errors).toEqual([]);
	} finally {
		window.removeEventListener('error', onError);
	}
}

async function pickingARowShowsIt(container: HTMLElement) {
	const rows = () => container.querySelectorAll<HTMLElement>('.row');
	const picked = () => container.querySelector('#picked')?.textContent;
	await withoutPageErrors(async () => {
		await expect.poll(() => rows().length).toBe(2);
		rows()[1]!.click();
		await expect.poll(picked).toBe('Picked Beta');
		rows()[0]!.click();
		await expect.poll(picked).toBe('Picked Alpha');
	});
}

async function choosingAChipShowsIt(container: HTMLElement) {
	const chosen = () => container.querySelector('[data-chosen]')?.textContent;
	await withoutPageErrors(async () => {
		expect(chosen()).toBe('none');
		container.querySelector<HTMLElement>('[data-chip="south"]')!.click();
		await expect.poll(chosen).toBe('south');
		container.querySelector<HTMLElement>('[data-chip="east"]')!.click();
		await expect.poll(chosen).toBe('east');
	});
}

async function savingInsideATryRunsTheCallback(
	container: HTMLElement,
	labels: ReadonlyArray<string>,
) {
	const saves = () => container.querySelector('[data-saves]')?.textContent;
	const save = (label: string) => container.querySelector<HTMLElement>(`[data-save="${label}"]`);
	await withoutPageErrors(async () => {
		for (const label of labels)
			await expect.poll(() => save(label)?.textContent).toBe(`${label} ready`);
		for (const [index, label] of labels.entries()) {
			save(label)!.click();
			await expect.poll(saves).toBe(`${index + 1} ${label}`);
		}
	});
}

test('CSR: a row callback forwarded through a list component runs on click', async () => {
	await pickingARowShowsIt((await render(TwoLevels)).container as HTMLElement);
});
test('SSR resume: a row callback forwarded through a list component runs on click', async () => {
	await pickingARowShowsIt((await renderSSR(TwoLevels)).container as HTMLElement);
});
test('CSR: a row callback handed straight to the row runs on click', async () => {
	await pickingARowShowsIt((await render(OneLevel)).container as HTMLElement);
});
test('SSR resume: a row callback handed straight to the row runs on click', async () => {
	await pickingARowShowsIt((await renderSSR(OneLevel)).container as HTMLElement);
});
test('CSR: a callback renamed on its way down two components into keyed rows runs on click', async () => {
	await choosingAChipShowsIt((await render(ThreeLevels)).container as HTMLElement);
});
test('SSR resume: a callback renamed on its way down two components into keyed rows runs on click', async () => {
	await choosingAChipShowsIt((await renderSSR(ThreeLevels)).container as HTMLElement);
});
test('CSR: a row child calls its callback from a button inside its own @try', async () => {
	await savingInsideATryRunsTheCallback((await render(GuardedRow)).container as HTMLElement, [
		'solo',
	]);
});
test('SSR resume: a row child calls its callback from a button inside its own @try', async () => {
	await savingInsideATryRunsTheCallback((await renderSSR(GuardedRow)).container as HTMLElement, [
		'solo',
	]);
});
test("CSR: a forwarded row callback called from inside the row child's own @try", async () => {
	await savingInsideATryRunsTheCallback(
		(await render(GuardedForwarded)).container as HTMLElement,
		['right', 'left'],
	);
});
test("SSR resume: a forwarded row callback called from inside the row child's own @try", async () => {
	await savingInsideATryRunsTheCallback(
		(await renderSSR(GuardedForwarded)).container as HTMLElement,
		['right', 'left'],
	);
});

async function takingSlotsInsideATryRunsTheCallback(container: HTMLElement) {
	const taken = () => container.querySelector('[data-taken]')?.textContent;
	const slot = (code: string) => container.querySelector<HTMLElement>(`[data-slot="${code}"]`);
	await withoutPageErrors(async () => {
		for (const code of ['k7', 'm2', 'q9'])
			await expect.poll(() => slot(code)?.textContent).toBe(`take ${code}`);
		slot('q9')!.click();
		await expect.poll(taken).toBe('q9');
		slot('k7')!.click();
		await expect.poll(taken).toBe('q9,k7');
	});
}

test("CSR: a callback renamed down three components runs from inside the row child's own @try", async () => {
	await takingSlotsInsideATryRunsTheCallback(
		(await render(GuardedRenamed)).container as HTMLElement,
	);
});
test("SSR resume: a callback renamed down three components runs from inside the row child's own @try", async () => {
	await takingSlotsInsideATryRunsTheCallback(
		(await renderSSR(GuardedRenamed)).container as HTMLElement,
	);
});

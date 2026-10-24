import { cleanup, render, renderServerHTML } from '@markless/vitest-browser';
import { commands } from 'vitest/browser';
import { afterEach, expect, test } from 'vitest';
import type { CorpusTemplate } from './corpus.ts';

// Every control, update and form in a generated arm or row lands on its own element after resume, in server HTML and client renders alike.
afterEach(() => cleanup());

type Entry = Omit<CorpusTemplate, 'source'> & { readonly path: string };

const manifest = Object.values(
	import.meta.glob<{ default: ReadonlyArray<Entry> }>('./generated/manifest.json', {
		eager: true,
	}),
)[0]!.default;
const modules = import.meta.glob<{ default: unknown }>('./generated/*.tsrx');
const load = (entry: Entry) => modules[`./generated/${entry.name}.tsrx`]!();

const hit = (container: ParentNode) => container.querySelector('[data-hit]')?.textContent;

// Two known gaps outside addressing leave a submit to its handler alone: a client-rendered row, and an arm a flip rebuilt after resume.
async function expectTargets(
	container: HTMLElement,
	entry: Entry,
	row?: string,
	cancelsAtOnce = true,
) {
	const scope = row ? container.querySelector(`[data-row="${row}"]`)! : container;
	for (const target of entry.targets) {
		const host = scope.querySelector<HTMLElement>(`[data-h="${target.id}"]`);
		expect(host, `${entry.name}: ${target.id} is on the page`).not.toBeNull();
		const expected = row ? `${target.id}-${row}` : target.id;
		if (target.kind === 'submit') {
			const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
			host!.dispatchEvent(event);
			if (cancelsAtOnce)
				expect(
					event.defaultPrevented,
					`${entry.name}: ${target.id} cancels its submit`,
				).toBe(true);
		} else host!.click();
		await expect
			.poll(() => hit(container), { message: `${entry.name}: ${target.id}` })
			.toBe(expected);
	}
}

async function expectUpdates(container: HTMLElement, entry: Entry) {
	container.querySelector<HTMLButtonElement>('[data-bump]')!.click();
	const shows = () =>
		[...container.querySelectorAll('[data-show]')].map((show) => show.textContent);
	await expect
		.poll(shows, { message: `${entry.name}: shown counts` })
		.toEqual(Array(entry.shows).fill('2'));
	const interpolated = () =>
		(container.querySelector('section')?.textContent ?? '').split('v2w').length - 1;
	await expect
		.poll(interpolated, { message: `${entry.name}: interpolated text` })
		.toBe(entry.interpolations);
}

async function exercise(container: HTMLElement, entry: Entry, served: boolean) {
	if (entry.family === 'rows') {
		await expectTargets(container, entry, '2', served);
		await expectTargets(container, entry, '1', served);
		if (!entry.flips) return;
		const flip = container.querySelector<HTMLButtonElement>('[data-flip]')!;
		const closed = () => container.querySelectorAll('em').length;
		flip.click();
		await expect.poll(closed, { message: `${entry.name}: every row's arm closes` }).toBeGreaterThan(0);
		flip.click();
		await expect.poll(closed, { message: `${entry.name}: every row's arm opens again` }).toBe(0);
		await expectTargets(container, entry, '1', served);
		await expectTargets(container, entry, '2', served);
		return;
	}
	await expectTargets(container, entry);
	await expectUpdates(container, entry);
	if (entry.family === 'arm') {
		const flip = container.querySelector<HTMLButtonElement>('[data-flip]')!;
		flip.click();
		await expect.poll(() => container.querySelector('section')).toBeNull();
		flip.click();
		await expect.poll(() => container.querySelector('section')).not.toBeNull();
		await expectTargets(container, entry, undefined, !served);
		return;
	}
	const notes = () => container.querySelectorAll('s').length;
	const shown = notes();
	const note = container.querySelector<HTMLButtonElement>('[data-note]')!;
	note.click();
	if (shown) await expect.poll(notes).toBe(0);
	await expectTargets(container, entry);
	note.click();
	await expect.poll(notes).toBe(shown);
	await expectTargets(container, entry);
}

test('the generated corpus is non-trivial', () => {
	expect(manifest.length).toBeGreaterThanOrEqual(20);
	expect(manifest.some((entry) => entry.refused)).toBe(true);
	expect(manifest.filter((entry) => !entry.refused).length).toBeGreaterThanOrEqual(15);
});

for (const entry of manifest) {
	if (entry.refused) {
		test(`${entry.name}: the build refuses a control no address can name`, async () => {
			await expect(commands.renderSSR(entry.path, 'default')).rejects.toThrow(
				/MARKLESS_ELEMENT_UNADDRESSABLE/,
			);
		});
		continue;
	}
	test(`${entry.name}: SSR resume lands every record on its own element`, async () => {
		const { html } = await commands.renderSSR(entry.path, 'default');
		await exercise(renderServerHTML(html).container, entry, true);
	});
	test(`${entry.name}: CSR lands every record on its own element`, async () => {
		const screen = await render((await load(entry)).default as never);
		await exercise(screen.container as HTMLElement, entry, false);
	});
}

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { SeveralForms } from './several-forms.tsrx';

// Forms with no handler, sent in place by real key presses and pointer clicks, with every answer held by the test.
installServer();
// Every answer a test holds is let go after it, so a failing test leaves no save out for the next one's reload to wait on.
const holding: Array<() => void> = [];
const hold = () => {
	const answer = deferred<void>();
	holding.push(() => answer.resolve());
	return answer;
};
beforeEach(() => resetServer());
afterEach(() => {
	for (const release of holding.splice(0)) release();
	server.holdReads = undefined;
	cleanup();
});

const modes = {
	'client-rendered': async () => (await render(SeveralForms)).container as HTMLElement,
	'server-rendered': async () => (await renderSSR(SeveralForms)).container as HTMLElement,
};

const reads = () => server.gets.filter((get) => get === '/mut/items').length;
const held = (count: number) => {
	const answers = Array.from({ length: count }, hold);
	server.nextPost = answers.map((answer) => ({ wait: answer.promise }));
	return answers;
};
const busyForms = (container: HTMLElement) =>
	[...container.querySelectorAll('form')]
		.filter((form) => form.getAttribute('aria-busy') === 'true')
		.map((form) => [...form.attributes].find((attribute) => attribute.name.startsWith('data-'))!.name);

for (const [mode, mount] of Object.entries(modes))
	describe(mode, () => {
		test('a second add typed while the first is out is sent with its own text, and nothing typed is lost', async () => {
			const container = await mount();
			await shows(container, '[data-names]', 'Ada');
			const field = container.querySelector<HTMLInputElement>('[data-title]')!;
			const [jam, tea] = held(2);
			await userEvent.click(field);
			await userEvent.keyboard('Jam{Enter}');
			await expect.poll(() => server.posts.length, poll).toBe(1);
			await userEvent.keyboard('{Backspace}{Backspace}{Backspace}Tea{Enter}');
			await expect.poll(() => server.posts, poll).toEqual([
				'POST /mut/items title=Jam',
				'POST /mut/items title=Tea',
			]);
			await userEvent.keyboard('{Backspace}{Backspace}{Backspace}Rye');
			jam!.resolve();
			tea!.resolve();
			await shows(container, '[data-names]', 'Ada, title=Jam, title=Tea');
			await expect.poll(() => busyForms(container), poll).toEqual([]);
			expect(field.value).toBe('Rye');
			expect(container.querySelector('[data-add-failed]')).toBeNull();
		});

		test('the field shows fresh once the last add it sent is answered', async () => {
			const container = await mount();
			await shows(container, '[data-names]', 'Ada');
			const field = container.querySelector<HTMLInputElement>('[data-title]')!;
			const [jam, tea] = held(2);
			await userEvent.click(field);
			await userEvent.keyboard('Jam{Enter}');
			await expect.poll(() => server.posts.length, poll).toBe(1);
			await userEvent.keyboard('{Backspace}{Backspace}{Backspace}Tea{Enter}');
			await expect.poll(() => server.posts.length, poll).toBe(2);
			jam!.resolve();
			// The reload waits for the add still out; Jam's own answer must not clear the field holding Tea.
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(field.value).toBe('Tea');
			tea!.resolve();
			await shows(container, '[data-names]', 'Ada, title=Jam, title=Tea');
			await expect.poll(() => field.value, poll).toBe('');
		});

		test('three different forms are all sent at once, and one reload after the last answer shows the result', async () => {
			const container = await mount();
			await shows(container, '[data-names]', 'Ada');
			const answers = held(3);
			const before = reads();
			await userEvent.click(container.querySelector('[data-star-submit]')!);
			await userEvent.click(container.querySelector('[data-pin-submit]')!);
			await userEvent.click(container.querySelector('[data-flag-submit]')!);
			await expect.poll(() => server.posts, poll).toEqual([
				'POST /mut/star on=yes',
				'POST /mut/pin on=one',
				'POST /mut/flag on=yes',
			]);
			expect(busyForms(container)).toEqual(['data-star', 'data-pin', 'data-flag']);
			for (const answer of answers) answer.resolve();
			await expect.poll(() => busyForms(container), poll).toEqual([]);
			expect(reads()).toBeGreaterThan(before);
			expect(container.querySelector('[data-failed]')).toBeNull();
		});

		test('the same form sent twice with the same fields while the first is out sends once', async () => {
			const container = await mount();
			await shows(container, '[data-names]', 'Ada');
			const [answer] = held(1);
			const button = container.querySelector<HTMLButtonElement>('[data-star-submit]')!;
			button.focus();
			await userEvent.keyboard('{Enter}');
			await expect.poll(() => server.posts.length, poll).toBe(1);
			await userEvent.keyboard('{Enter}');
			// A person can press a button marked aria-disabled; the browser still submits.
			await userEvent.click(button, { force: true });
			answer!.resolve();
			await expect.poll(() => busyForms(container), poll).toEqual([]);
			expect(server.posts).toEqual(['POST /mut/star on=yes']);
		});

		test('one form sending marks only that form and its button; the others stay unmarked and usable', async () => {
			const container = await mount();
			await shows(container, '[data-names]', 'Ada');
			const [star, pin] = held(2);
			const button = container.querySelector<HTMLButtonElement>('[data-star-submit]')!;
			await userEvent.click(button);
			await expect.poll(() => server.posts.length, poll).toBe(1);
			expect(busyForms(container)).toEqual(['data-star']);
			expect(button.getAttribute('aria-disabled')).toBe('true');
			star!.resolve();
			// While the reload after the save is out, forms that show the reloading value are not marked as sending.
			await expect.poll(() => button.hasAttribute('aria-disabled'), poll).toBe(false);
			expect(busyForms(container).filter((name) => name !== 'data-star')).toEqual([]);
			await expect.poll(() => busyForms(container), poll).toEqual([]);
			const pinButton = container.querySelector<HTMLButtonElement>('[data-pin-submit]')!;
			expect(pinButton.hasAttribute('aria-disabled')).toBe(false);
			await userEvent.click(pinButton);
			await expect.poll(() => server.posts.at(-1), poll).toBe('POST /mut/pin on=one');
			expect(busyForms(container)).toEqual(['data-pin']);
			pin!.resolve();
			await expect.poll(() => busyForms(container), poll).toEqual([]);
		});

		test('no form is marked while a reload another form caused is out', async () => {
			const container = await mount();
			await shows(container, '[data-names]', 'Ada');
			const reload = hold();
			const field = container.querySelector<HTMLInputElement>('[data-title]')!;
			server.nextPost = [{ now: true }];
			server.holdReads = reload.promise;
			const before = reads();
			await userEvent.click(field);
			await userEvent.keyboard('Jam{Enter}');
			await expect.poll(() => reads(), poll).toBeGreaterThan(before);
			expect(busyForms(container).filter((name) => name !== 'data-add')).toEqual([]);
			server.holdReads = undefined;
			reload.resolve();
			await shows(container, '[data-names]', 'Ada, title=Jam');
			await expect.poll(() => busyForms(container), poll).toEqual([]);
		});

		test('a failed send among successful ones shows its message and leaves no form busy', async () => {
			const container = await mount();
			await shows(container, '[data-names]', 'Ada');
			const star = hold();
			const pin = hold();
			const flag = hold();
			server.nextPost = [
				{ wait: star.promise },
				{ wait: pin.promise, status: 422, body: 'Pin refused' },
				{ wait: flag.promise },
			];
			await userEvent.click(container.querySelector('[data-star-submit]')!);
			await userEvent.click(container.querySelector('[data-pin-submit]')!);
			container.querySelector<HTMLButtonElement>('[data-flag-submit]')!.focus();
			await userEvent.keyboard('{Enter}');
			await expect.poll(() => server.posts.length, poll).toBe(3);
			star.resolve();
			pin.resolve();
			flag.resolve();
			await shows(container, '[data-failed]', 'Pin refused');
			await expect.poll(() => busyForms(container), poll).toEqual([]);
			expect(server.posts).toEqual(['POST /mut/star on=yes', 'POST /mut/pin on=one', 'POST /mut/flag on=yes']);
		});
	});

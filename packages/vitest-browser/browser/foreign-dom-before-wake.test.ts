import { afterEach, expect, test } from 'vitest';
import { cleanup, renderServerHTML, renderSSRPhased } from '../src/index.ts';
import App from './fixtures/foreign-dom-before-wake.tsrx';

// The script runs where a third-party one would: after the markup it edits, before the page's own boot.
afterEach(() => cleanup());

const docSearchSwap = `
	const slot = document.querySelector('[data-search-slot]');
	const button = document.createElement('button');
	button.className = 'DocSearch DocSearch-Button';
	button.innerHTML = '<span class="DocSearch-Button-Container"><svg width="20" height="20"><path d="M0 0"></path></svg><span>Search</span></span><span class="DocSearch-Button-Keys"><kbd>K</kbd></span>';
	slot.replaceChildren(button);`;

const githubButtonsInsert = `
	const star = document.querySelector('a.github-button');
	const span = document.createElement('span');
	span.innerHTML = '<iframe title="Star on GitHub"></iframe>';
	star.replaceWith(span);
	document.querySelector('header').prepend(document.createElement('span'));`;

const ownedSwap = `
	const owned = document.querySelector('[data-owned]');
	const swapped = document.createElement('section');
	swapped.setAttribute('data-swapped', '');
	swapped.append(document.createElement('i'), document.createElement('i'));
	owned.replaceWith(swapped);`;

async function mountWithForeignScript(source: string) {
	const { html } = await renderSSRPhased(App);
	const at = html.indexOf('</header>') + '</header>'.length;
	expect(at).toBeGreaterThan('</header>'.length);
	return renderServerHTML(`${html.slice(0, at)}<script>${source}</script>${html.slice(at)}`);
}

function reportedErrors(): { readonly messages: string[]; readonly stop: () => void } {
	const messages: string[] = [];
	const listener = (event: ErrorEvent) => {
		messages.push(String(event.error?.message ?? event.message));
		event.preventDefault();
	};
	window.addEventListener('error', listener);
	return { messages, stop: () => window.removeEventListener('error', listener) };
}

function text(container: ParentNode, selector: string): string | null | undefined {
	return container.querySelector(selector)?.textContent;
}

test('a DocSearch-style swap and a buttons.js-style insertion before wake leave every host resuming', async () => {
	const errors = reportedErrors();
	try {
		const screen = await mountWithForeignScript(docSearchSwap + githubButtonsInsert);
		const container = screen.container;
		expect(container.querySelector('.DocSearch')).not.toBeNull();
		expect(container.querySelector('a.github-button')).toBeNull();

		container.querySelector<HTMLButtonElement>('[data-bump]')!.click();
		await expect.poll(() => text(container, '[data-owned]')).toBe('1');
		expect(container.querySelector('[data-owned]')?.className).toBe('on');
		container.querySelector<HTMLButtonElement>('[data-other]')!.click();
		await expect.poll(() => text(container, '[data-other-count]')).toBe('1');
		expect(errors.messages).toEqual([]);
	} finally {
		errors.stop();
	}
});

test('a swap that hits an element Markless updates drops only that element and names what took its place', async () => {
	const errors = reportedErrors();
	try {
		const screen = await mountWithForeignScript(ownedSwap);
		const container = screen.container;
		container.querySelector<HTMLButtonElement>('[data-other]')!.click();
		await expect.poll(() => text(container, '[data-other-count]')).toBe('1');
		container.querySelector<HTMLButtonElement>('[data-bump]')!.click();
		container.querySelector<HTMLButtonElement>('[data-other]')!.click();
		await expect.poll(() => text(container, '[data-other-count]')).toBe('2');

		await expect.poll(() => errors.messages.length).toBeGreaterThan(0);
		expect(errors.messages.join('\n')).toMatch(/<section data-swapped="">/);
		expect(errors.messages.join('\n')).toMatch(/main:nth-child\(\d\) > section:nth-child\(1\)/);
	} finally {
		errors.stop();
	}
});

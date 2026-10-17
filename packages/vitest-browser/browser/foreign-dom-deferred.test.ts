import { afterEach, expect, test } from 'vitest';
import { cleanup, renderServerHTML, renderSSRPhased } from '../src/index.ts';
import App from './fixtures/foreign-dom-deferred.tsrx';

const host = globalThis as typeof globalThis & { __foreignDeferLog?: string[] };
afterEach(() => {
	cleanup();
	delete host.__foreignDeferLog;
});

// A DocSearch-style swap adds elements before the deferred triggers register, shifting every later index.
const docSearchSwap = `
	const slot = document.querySelector('[data-search-slot]');
	const button = document.createElement('button');
	button.innerHTML = '<span><svg width="20" height="20"><path d="M0 0"></path></svg><span>Search</span></span><kbd>K</kbd>';
	slot.replaceChildren(button);`;

test('visible and idle handlers still run on their own hosts when a script changed the page first', async () => {
	const { html } = await renderSSRPhased(App);
	const at = html.indexOf('</header>') + '</header>'.length;
	expect(at).toBeGreaterThan('</header>'.length);
	const screen = await renderServerHTML(
		`${html.slice(0, at)}<script>${docSearchSwap}</script>${html.slice(at)}`,
	);
	expect(screen.container.querySelector('kbd')).not.toBeNull();
	await expect
		.poll(() => [...(host.__foreignDeferLog ?? [])].sort(), { timeout: 5000 })
		.toEqual(['idle', 'visible']);
});

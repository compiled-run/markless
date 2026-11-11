import { afterEach, expect, test } from 'vitest';
import { cleanup, renderCsrIslands, renderSSRIslands } from '../../src/index.ts';
import FeedBlock from './feed-block.tsrx';
import NoteBlock from './note-block.tsrx';

// A docs page mounts each live block as an island, every one rooted at a component of the same name, with the example projected into the block's frame.

afterEach(() => cleanup());

const pages = () =>
	[...document.querySelectorAll('[data-page]')].map((page) => page.textContent?.replace(/\s+/g, ' ').trim());

async function addedPageLoadsItsOwnPosts() {
	await expect.poll(pages, { timeout: 3_000 }).toEqual(['Post 1 of page 1Post 2 of page 1']);
	(document.querySelector('[data-more]') as HTMLElement).click();
	await expect
		.poll(pages, { timeout: 3_000 })
		.toEqual(['Post 1 of page 1Post 2 of page 1', 'Post 1 of page 2Post 2 of page 2']);
}

for (const [mode, mount] of [
	['ssr', () => renderSSRIslands([FeedBlock])],
	['csr', () => renderCsrIslands([FeedBlock])],
] as const) {
	test(`${mode} island: a row added to a list projected into the island's frame loads its own async value`, async () => {
		await mount();
		await addedPageLoadsItsOwnPosts();
	});
}

for (const [mode, mount] of [
	['ssr', () => renderSSRIslands([FeedBlock, NoteBlock])],
	['csr', () => renderCsrIslands([FeedBlock, NoteBlock])],
] as const) {
	test(`${mode} islands: a row added in the first of two islands with same-named roots renders from its own island`, async () => {
		await mount();
		await addedPageLoadsItsOwnPosts();
		expect(document.querySelector('[data-note]')).not.toBeNull();
	});
}

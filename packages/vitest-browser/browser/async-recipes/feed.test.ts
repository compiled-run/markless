import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, requested, resetCalls } from './gate.ts';
import Feed from './feed.tsrx';
import { frames, press, settles } from './support.ts';

afterEach(cleanup);

/** Each page's row, read as its posts, its loading line or its failure line. */
const pages = () =>
	[...document.querySelectorAll('ol > li')].map((page) => {
		const posts = [...page.querySelectorAll('ul > li')].map((post) => post.textContent?.trim());
		if (posts.length) return posts.join(', ');
		return (page.querySelector('span') ?? page.querySelector('p'))?.textContent?.trim() ?? '';
	});
const requests = () => [1, 2, 3, 4].map((page) => requested(`page ${page}`));

async function middlePageFailsAndRetriesAlone(pageOneInBrowser: number) {
	const one = document.querySelector('ol > li')!;
	press('Load more');
	await settles(() => requested('page 2')).toBe(1);
	press('Load more');
	await settles(() => requested('page 3')).toBe(1);
	expect(pages()).toEqual(['Post 1.1, Post 1.2', 'Loading page 2', 'Loading page 3']);

	answer('page 3');
	answer('page 2', { error: new Error('Server busy') });
	await settles(pages).toEqual([
		'Post 1.1, Post 1.2',
		"Page 2 didn't load.",
		'Post 3.1, Post 3.2',
	]);
	const three = document.querySelectorAll('ol > li')[2]!;

	press('Try again');
	await settles(() => requested('page 2')).toBe(2);
	answer('page 2');
	await settles(pages).toEqual(['Post 1.1, Post 1.2', 'Post 2.1, Post 2.2', 'Post 3.1, Post 3.2']);

	press('Load more');
	await settles(() => requested('page 4')).toBe(1);
	answer('page 4');
	await settles(() => pages().length).toBe(4);
	await frames();
	expect(requests()).toEqual([pageOneInBrowser, 2, 1, 1]);
	expect(document.querySelector('ol > li')).toBe(one);
	expect(document.querySelectorAll('ol > li')[2]).toBe(three);
}

test('CSR: each page loads in its own block; a failed middle page retries alone and loaded pages are never asked again', async () => {
	resetCalls();
	await render(Feed);
	await settles(() => requested('page 1')).toBe(1);
	answer('page 1');
	await settles(pages).toEqual(['Post 1.1, Post 1.2']);
	await middlePageFailsAndRetriesAlone(1);
});

test('SSR: the server sends page 1; pages added after resume load, fail and retry on their own', async () => {
	resetCalls();
	await renderSSR(Feed);
	expect(pages()).toEqual(['Post 1.1, Post 1.2']);
	await middlePageFailsAndRetriesAlone(0);
});

test('CSR: a page that fails on its first load leaves the pages around it alone', async () => {
	resetCalls();
	await render(Feed);
	await settles(() => requested('page 1')).toBe(1);
	answer('page 1');
	press('Load more');
	await settles(() => requested('page 2')).toBe(1);
	answer('page 2', { error: new Error('Server busy') });
	await settles(pages).toEqual(['Post 1.1, Post 1.2', "Page 2 didn't load."]);
	press('Load more');
	await settles(() => requested('page 3')).toBe(1);
	answer('page 3');
	await settles(pages).toEqual([
		'Post 1.1, Post 1.2',
		"Page 2 didn't load.",
		'Post 3.1, Post 3.2',
	]);
	expect(requests()).toEqual([1, 1, 1, 0]);
});

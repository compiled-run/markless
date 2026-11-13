import { expect, test } from 'vitest';
import { render, renderSSR } from '../../../src/index.ts';
import AsyncOther from './async-other.tsrx';
import AsyncSame from './async-same.tsrx';
import MemberBool from './member-bool.tsrx';
import SyncBare from './sync-bare.tsrx';
import SyncOther from './sync-other.tsrx';

// A child's @if whose test computes over a member of an object prop, such as `value.n > 1`.
const shown = () => document.querySelector('[data-r]')?.textContent?.trim();

async function flipsBothWays() {
	await expect.poll(shown).toBe('big 2');
	document.querySelector<HTMLElement>('[data-flip]')!.click();
	await expect.poll(shown).toBe('small 1');
	document.querySelector<HTMLElement>('[data-flip]')!.click();
	await expect.poll(shown).toBe('big 2');
}

test('a bare prop in the test flips the arm', async () => {
	await render(SyncBare);
	await flipsBothWays();
});

test('a member of an object prop read as the whole test flips the arm', async () => {
	await render(MemberBool);
	await flipsBothWays();
});

// Known defect: a test that computes over a prop's member is not re-run when the prop changes, so the first arm stays
// while the text inside it follows the new value.
test.fails('CSR: a test computed over a member of a sync object prop flips the arm', async () => {
	await render(SyncOther);
	await flipsBothWays();
});

test.fails('CSR: a test computed over a member of an async object prop flips the arm', async () => {
	await render(AsyncOther);
	await flipsBothWays();
});

test.fails('SSR: a test computed over a member of an async object prop flips the arm', async () => {
	await renderSSR(AsyncOther);
	await flipsBothWays();
});

test.fails('CSR: the same with the child in the page file', async () => {
	await render(AsyncSame);
	await flipsBothWays();
});

import { expect, test } from 'vitest';
import { render } from '../../../src/index.ts';
import SyncBareIndex from './sync-bare-index.tsrx';
import SyncComponent from './sync-component.tsrx';
import SyncInline from './sync-inline.tsrx';

// A keyed @for whose rows show the loop index, when a row is added in front of the others.
const rows = () => [...document.querySelectorAll('[data-r]')].map((row) => row.textContent?.replace(/\s+/g, ' ').trim());

async function numbersFollow(page: Parameters<typeof render>[0], start: number) {
	await render(page);
	await expect.poll(rows).toEqual([`${start}. x`]);
	document.querySelector<HTMLElement>('[data-add]')!.click();
	await expect.poll(rows).toEqual([`${start}. w`, `${start + 1}. x`]);
}

test('an inline row follows its index', () => numbersFollow(SyncInline, 1));

test('a row component follows an index prop', () => numbersFollow(SyncComponent, 1));
test('a row component follows the bare index', () => numbersFollow(SyncBareIndex, 0));

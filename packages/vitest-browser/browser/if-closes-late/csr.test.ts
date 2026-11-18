import { afterEach, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import GroceriesPage from './groceries-page.tsrx';
import { answerClosesLoadingAsRowsFill } from './support.ts';

// One test per file on purpose: its answer is the first write in the file to close a branch, so the journal's range code is not loaded yet.
afterEach(() => cleanup());

test('CSR: an awaited answer closes the @if and fills the @for beside it in one task', async () => {
	await render(GroceriesPage);
	await answerClosesLoadingAsRowsFill();
});

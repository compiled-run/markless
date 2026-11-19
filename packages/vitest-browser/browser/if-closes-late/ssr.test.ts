import { afterEach, test } from 'vitest';
import { cleanup, renderSSR } from '../../src/index.ts';
import GroceriesPage from './groceries-page.tsrx';
import { answerClosesLoadingAsRowsFill } from './support.ts';

// One test per file on purpose: its answer is the first write in the file to close a branch, so the journal's range code is not loaded yet.
afterEach(() => cleanup());

test('SSR: an awaited answer closes the @if and fills the @for beside it in one task after resume', async () => {
	await renderSSR(GroceriesPage);
	await answerClosesLoadingAsRowsFill();
});

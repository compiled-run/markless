import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import EditorInIf from './editor-in-if.tsrx';
import EditorFragment from './editor-fragment.tsrx';
import EditorElement from './editor-element.tsrx';
import EditorOneWrite from './editor-one-write.tsrx';

afterEach(cleanup);

const head = () => document.querySelector('[data-head]')?.textContent?.replace(/\s+/g, ' ').trim();
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

// Each fail button writes the inputs of the async value; most write two, so two refreshes fail one after the other.
async function failedRefreshKeepsContent() {
	click('[data-open]');
	await expect.poll(head).toBe('Back Editing "todo 3 v0" (#3)');
	click('[data-fail]');
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(head()).toBe('Back Editing "todo 3 v0" (#3)');
	expect(document.querySelectorAll('[data-head] [data-back]')).toHaveLength(1);
}

test('CSR: a fragment @try with an empty @catch in a component under @if keeps its content after failed refreshes', async () => {
	await render(EditorInIf);
	await failedRefreshKeepsContent();
});

test('SSR: a fragment @try with an empty @catch in a component under @if keeps its content after failed refreshes', async () => {
	await renderSSR(EditorInIf);
	await failedRefreshKeepsContent();
});

test('CSR: a fragment @try with an empty @catch in a child component keeps its content after failed refreshes', async () => {
	await render(EditorFragment);
	await failedRefreshKeepsContent();
});

test('SSR: a fragment @try with an empty @catch in a served child component keeps its content after failed refreshes', async () => {
	await renderSSR(EditorFragment);
	await failedRefreshKeepsContent();
});

test('CSR: an element @try with an empty @catch in a child component keeps its content after failed refreshes', async () => {
	await render(EditorElement);
	await failedRefreshKeepsContent();
});

test('SSR: an element @try with an empty @catch in a served child component keeps its content after failed refreshes', async () => {
	await renderSSR(EditorElement);
	await failedRefreshKeepsContent();
});

test('CSR: a fragment @try with an empty @catch keeps its content after one failed refresh', async () => {
	await render(EditorOneWrite);
	await failedRefreshKeepsContent();
});

test('SSR: a fragment @try with an empty @catch keeps its content after one failed refresh', async () => {
	await renderSSR(EditorOneWrite);
	await failedRefreshKeepsContent();
});

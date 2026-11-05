// What the testing figure prints: the component, its browser test, and Vitest's own failure line when the click stops marking the item done.

export const COMPONENT = ['TodoItem.tsrx', "import { state } from '@markless/core';", '', 'export default function TodoItem() @{', '\tlet done = state(false);', '', "\t<button onClick={() => (done = !done)}>", "\t\tBuy milk: {done ? 'done' : 'to do'}", '\t</button>', '}'];

/** The handler on the button's line, as written and as broken by a click. */
export const HANDLER = { ok: '(done = !done)', broken: '(done = false)' };

export const TEST = ['todo.browser.ts', "import { render } from '@markless/vitest-browser';", "import { expect, test } from 'vite-plus/test';", "import { page } from 'vite-plus/test/browser';", "import TodoItem from './TodoItem.tsrx';", '', "test('a click marks it done', async () => {", '\tawait render(TodoItem);', "\tconst item = page.getByRole('button', { name: /buy milk/i });", '\tawait item.click();', "\tawait expect.element(item).toHaveTextContent('Buy milk: done');", '});'];

/** What Vitest printed for this expectation when the text never changed (a real run, Vitest 5.0.5 in Chromium). */
export const FAILURE = 'Error: expect(element).toHaveTextContent()\nExpected element to have text content:\n  Buy milk: done\nReceived:\n  Buy milk: to do';

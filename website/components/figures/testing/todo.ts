// What the testing figure prints: the component, its browser test, and Vitest's own failure line when the click stops marking the item done.

export const COMPONENT = ['TodoItem.tsrx', "import { state } from '@markless/core';", '', 'export default function TodoItem() @{', '\tlet done = state(false);', '', "\t<button onClick={() => (done = !done)}>", "\t\tBuy milk: {done ? 'done' : 'to do'}", '\t</button>', '}'];

/** The handler on the button's line, as written and as broken by a click. */
export const HANDLER = { ok: '(done = !done)', broken: '(done = false)' };

export const TEST = ['todo.browser.ts', "import { render } from '@markless/vitest-browser';", "import { expect, test } from 'vite-plus/test';", "import TodoItem from './TodoItem.tsrx';", '', "test('a click marks it done', async () => {", '\tawait render(TodoItem);', "\tconst button = document.querySelector('button')!;", '\tbutton.click();', "\tawait expect.poll(() => button.textContent).toBe('Buy milk: done');", '});'];

/** What Vitest printed for this expectation when the text never changed (a real run). */
export const FAILURE = "AssertionError: expected 'Buy milk: to do' to be 'Buy milk: done' // Object.is equality";

import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderServerHTML, renderStream } from '../../src/index.ts';
import Deep from './deep.tsrx';
import Direct from './direct.tsrx';
import Framed from './framed.tsrx';
import { asked, resetNotes } from './load.ts';
import Opened from './opened.tsrx';
import Bag from './bag.tsrx';
import Rows from './rows.tsrx';
import ServedOpen from './served-open.tsrx';

// A child's async value reads the page's `params.id` and a `url` search value it was handed. Every re-run in
// the browser (a state write, a save's reload, a new route) reads what the first run read, wherever the child
// sits: directly in the page, in a layout's children, two components down, or in a click-opened @if arm.

afterEach(async () => {
	await cleanup();
	resetNotes();
});

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

// What the child shows: its value, or the @catch text when a run failed.
const shown = () =>
	document.querySelector('[data-note-failed]')
		? `failed: ${document.querySelector('[data-note-failed]')!.textContent}`
		: (document.querySelector('[data-note]')?.textContent ?? null);

// A stream append is parsed after the shell, so its inline scripts run as it lands.
function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName === 'SCRIPT') {
			const script = document.createElement('script');
			for (const attribute of Array.from((node as Element).attributes))
				script.setAttribute(attribute.name, attribute.value);
			script.text = node.textContent ?? '';
			container.appendChild(script);
		} else container.appendChild(node);
	}
}

async function reRuns(firstRound: number) {
	click('[data-again]');
	await expect.poll(shown).toBe(`note abc info rev 0 #${firstRound + 1}`);
	click('[data-save]');
	await expect.poll(shown).toBe(`note abc info rev 1 #${firstRound + 2}`);
	click('[data-next]');
	await expect.poll(shown).toBe(`note xyz more rev 0 #${firstRound + 2}`);
	click('[data-again]');
	await expect.poll(shown).toBe(`note xyz more rev 0 #${firstRound + 3}`);
	expect(asked.filter((entry) => entry.includes('undefined'))).toEqual([]);
	expect(document.querySelector('[data-note-failed]')).toBeNull();
}

const placements = [
	{ name: 'directly in the page', page: Direct, stream: () => renderStream(Direct) },
	{ name: "in a layout's children", page: Framed, stream: () => renderStream(Framed) },
	{ name: 'two components down', page: Deep, stream: () => renderStream(Deep) },
] as const;

for (const placement of placements) {
	test(`client-rendered, ${placement.name}: every re-run reads the page's params and url`, async () => {
		await render(placement.page);
		await expect.poll(shown).toBe('note abc info rev 0 #1');
		await reRuns(1);
		expect(asked).toEqual([
			'load abc info',
			'load abc info',
			'save abc',
			'load abc info',
			'load xyz more',
			'load xyz more',
		]);
	});

	test(`server-rendered, ${placement.name}: the first value streams and every re-run reads the page's params and url`, async () => {
		const { shell, appends } = await placement.stream();
		const { container } = renderServerHTML(shell);
		for (const chunk of appends) appendStreamed(container, chunk);
		await expect.poll(shown).toBe('note abc info rev 0 #1');
		expect(asked).toEqual([]);
		await reRuns(1);
		expect(asked).toEqual(['load abc info', 'save abc', 'load abc info', 'load xyz more', 'load xyz more']);
	});
}

test("client-rendered, in a click-opened @if arm: every run reads the page's params and url", async () => {
	await render(Opened);
	click('[data-open]');
	await expect.poll(shown).toBe('note abc info rev 0 #1');
	await reRuns(1);
	expect(asked.filter((entry) => entry === 'save abc')).toHaveLength(1);
});

test("server-rendered, in a click-opened @if arm: every run reads the page's params and url", async () => {
	const { shell, appends } = await renderStream(Opened);
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
	click('[data-open]');
	await expect.poll(shown).toBe('note abc info rev 0 #1');
	await reRuns(1);
	expect(asked.filter((entry) => entry === 'save abc')).toHaveLength(1);
});

async function served(stream: Promise<{ readonly shell: string; readonly appends: ReadonlyArray<string> }>) {
	const { shell, appends } = await stream;
	const { container } = renderServerHTML(shell);
	for (const chunk of appends) appendStreamed(container, chunk);
}

const bagReRuns = async () => {
	click('[data-again]');
	await expect.poll(shown).toBe('note abc info rev 0 #2');
	click('[data-next]');
	await expect.poll(shown).toBe('note xyz more rev 0 #2');
	expect(asked.filter((entry) => entry.includes('undefined'))).toEqual([]);
};

test('client-rendered, a child that takes its props as one bag: every run reads the page\'s params and url', async () => {
	await render(Bag);
	await expect.poll(shown).toBe('note abc info rev 0 #1');
	await bagReRuns();
});

test('server-rendered, a child that takes its props as one bag: every run reads the page\'s params and url', async () => {
	await served(renderStream(Bag));
	await expect.poll(shown).toBe('note abc info rev 0 #1');
	expect(asked).toEqual([]);
	await bagReRuns();
});

const reopenReRuns = async () => {
	click('[data-again]');
	await expect.poll(shown).toBe('note abc info rev 0 #2');
	click('[data-toggle]');
	await expect.poll(() => document.querySelector('[data-note]')).toBeNull();
	click('[data-toggle]');
	await expect.poll(shown).toBe('note abc info rev 0 #1');
	click('[data-again]');
	await expect.poll(shown).toBe('note abc info rev 0 #2');
	click('[data-next]');
	await expect.poll(shown).toBe('note xyz more rev 0 #2');
	expect(asked.filter((entry) => entry.includes('undefined'))).toEqual([]);
};

test('client-rendered, in an @if arm open at load: re-runs, then close and reopen, read the page\'s params and url', async () => {
	await render(ServedOpen);
	await expect.poll(shown).toBe('note abc info rev 0 #1');
	await reopenReRuns();
});

test('server-rendered, in an @if arm open at load: re-runs, then close and reopen, read the page\'s params and url', async () => {
	await served(renderStream(ServedOpen));
	await expect.poll(shown).toBe('note abc info rev 0 #1');
	expect(asked).toEqual([]);
	await reopenReRuns();
});

const rowText = (part: string) => {
	const row = document.querySelector(`li[data-part="${part}"]`);
	const failed = row?.querySelector('[data-note-failed]');
	return failed ? `failed: ${failed.textContent}` : (row?.querySelector('[data-note]')?.textContent ?? null);
};

const rowReRuns = async () => {
	(document.querySelector('li[data-part="b"] [data-again]') as HTMLElement).click();
	await expect.poll(() => rowText('b')).toBe('note abc-b info rev 0 #2');
	expect(rowText('a')).toBe('note abc-a info rev 0 #1');
	click('[data-next]');
	await expect.poll(() => rowText('a')).toBe('note xyz-a more rev 0 #1');
	await expect.poll(() => rowText('b')).toBe('note xyz-b more rev 0 #2');
	expect(asked.filter((entry) => entry.includes('undefined'))).toEqual([]);
};

test('client-rendered, a component row: each row\'s re-run reads the page\'s params and url', async () => {
	await render(Rows);
	for (const part of ['a', 'b']) await expect.poll(() => rowText(part)).toBe(`note abc-${part} info rev 0 #1`);
	await rowReRuns();
});

test('server-rendered, a component row: each row streams, then re-runs with the page\'s params and url', async () => {
	await served(renderStream(Rows));
	for (const part of ['a', 'b']) await expect.poll(() => rowText(part)).toBe(`note abc-${part} info rev 0 #1`);
	expect(asked).toEqual([]);
	await rowReRuns();
});

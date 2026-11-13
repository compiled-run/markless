import { afterEach, beforeEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { deferred, poll, shows, text } from '../back-revalidate/support.ts';
import { installServer, resetServer, server } from '../mutations-refresh/server.ts';
import { AroundForm } from './around-form.tsrx';
import { AuthoredForm } from './authored-form.tsrx';
import { ChoiceForm } from './choice-form.tsrx';
import { ClearingForm } from './clearing-form.tsrx';
import { ControlsForm } from './controls-form.tsrx';
import { CustomFieldForm } from './custom-field-form.tsrx';
import { FileForm } from './file-form.tsrx';
import { ImageForm } from './image-form.tsrx';
import { NeverForm } from './never-form.tsrx';
import { NoteForm } from './note-form.tsrx';
import { OwnersForm } from './owners-form.tsrx';
import { PropForm } from './prop-form.tsrx';
import { RemovedForm } from './removed-form.tsrx';
import { SyncForm } from './sync-form.tsrx';

// While a form's async submit handler runs, and the reload its save caused, the form is busy and an identical repeat is not sent.
installServer();
beforeEach(() => resetServer());
afterEach(() => cleanup());

const busy = (form: Element) => form.getAttribute('aria-busy');
const posts = () => server.posts.map((post) => post.replace('POST /mut/items ', ''));
const reads = () => server.gets.filter((get) => get === '/mut/items').length;
// A later submission that must be the next one sent: every press before it that was not sent is then known to be dropped.
async function sentNext(press: () => void, expected: string[]) {
	press();
	await expect.poll(posts, poll).toEqual(expected);
}

function parts(container: ParentNode) {
	return {
		form: container.querySelector<HTMLFormElement>('[data-form]')!,
		field: container.querySelector<HTMLInputElement>('[data-field]')!,
		submitter: container.querySelector<HTMLButtonElement>('[data-submit]')!,
	};
}

// A person presses again: a click, Enter on the button, a script's requestSubmit with it, then Enter in the field.
async function pressAgain(field: HTMLInputElement, submitter: HTMLButtonElement) {
	submitter.click();
	submitter.focus();
	await userEvent.keyboard('{Enter}');
	submitter.form!.requestSubmit(submitter);
	field.focus();
	await userEvent.keyboard('{Enter}');
	submitter.focus();
}

async function holdsThroughSave(container: HTMLElement, fail: boolean) {
	const { form, field, submitter } = parts(container);
	const answer = deferred<void>();
	const failing = fail ? { status: 422, body: 'Name taken' } : {};
	server.nextPost = [{ wait: answer.promise, ...failing }, failing];
	submitter.focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(submitter.getAttribute('aria-disabled')).toBe('true');
	expect(submitter.hasAttribute('disabled')).toBe(false);
	expect(document.activeElement).toBe(submitter);
	expect(getComputedStyle(form).opacity).toBe('0.5');
	await pressAgain(field, submitter);
	field.value = 'Hopper';
	await sentNext(() => submitter.click(), ['Grace', 'Hopper']);
	field.value = 'Grace';
	expect(busy(form)).toBe('true');
	expect(document.activeElement).toBe(submitter);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(submitter.hasAttribute('aria-disabled')).toBe(false);
	return { form, submitter };
}

test('CSR: busy and marked from the submit until the save and its reload are done; repeats are not sent', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { form, submitter } = await holdsThroughSave(container, false);
	// The server keeps items in the order their saves finish.
	await shows(container, '[data-names]', 'Ada, Hopper, Grace');
	expect(document.activeElement).toBe(submitter);
	expect(getComputedStyle(form).opacity).toBe('1');
	await sentNext(() => submitter.click(), ['Grace', 'Hopper', 'Grace']);
});

test('SSR resume: the served form is busy through its save and reload, and a repeat is not sent', async () => {
	const { container } = await renderSSR(NoteForm);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	await holdsThroughSave(container as HTMLElement, false);
	await shows(container as HTMLElement, '[data-names]', 'Ada, Hopper, Grace');
});

// A person's own pointer and keys, which reach the page as trusted events and let promise jobs run between listeners.
async function realPresses(container: HTMLElement) {
	const { form, field, submitter } = parts(container);
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	await userEvent.click(submitter);
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(submitter.getAttribute('aria-disabled')).toBe('true');
	await userEvent.click(field);
	await userEvent.keyboard('{Enter}');
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(posts()).toEqual(['Grace']);
	await shows(container, '[data-names]', 'Ada, Grace');
	await userEvent.fill(field, 'Hopper');
	await userEvent.keyboard('{Enter}');
	await expect.poll(posts, poll).toEqual(['Grace', 'Hopper']);
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	await shows(container, '[data-names]', 'Ada, Grace, Hopper');
}

test('CSR: a real click holds the form through its save; Enter in the field repeats nothing, then sends a changed value', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	await realPresses(container);
});

test('SSR resume: the same with a real click and real keys on the served form', async () => {
	const { container } = await renderSSR(NoteForm);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	await realPresses(container as HTMLElement);
});

test('CSR: a rejected save clears the marks at once, with no reload, and reaches the nearest @catch', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const readsBefore = reads();
	await holdsThroughSave(container, true);
	await shows(container, '[data-failed]', 'Name taken');
	expect(reads()).toBe(readsBefore);
});

test('SSR resume: a rejected save clears the marks and reaches the nearest @catch', async () => {
	const { container } = await renderSSR(NoteForm);
	expect(text(container as HTMLElement, '[data-names]')).toBe('Ada');
	await holdsThroughSave(container as HTMLElement, true);
	await shows(container as HTMLElement, '[data-failed]', 'Name taken');
});

test('the form stays busy while the old list is on screen, and an identical re-press during the reload is not sent', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { form, field, submitter } = parts(container);
	const reloaded = deferred<void>();
	server.holdReads = reloaded.promise;
	submitter.click();
	await expect.poll(() => reads(), poll).toBe(2);
	expect(text(container, '[data-names]')).toBe('Ada');
	expect(busy(form)).toBe('true');
	expect(submitter.getAttribute('aria-disabled')).toBe('true');
	submitter.click();
	field.value = 'Hopper';
	await sentNext(() => submitter.click(), ['Grace', 'Hopper']);
	server.holdReads = undefined;
	reloaded.resolve();
	await shows(container, '[data-names]', 'Ada, Grace, Hopper');
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});

test('the reloaded list and the cleared form land in one frame', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { form, submitter } = parts(container);
	const list = container.querySelector('[data-names]')!;
	const reloaded = deferred<void>();
	server.holdReads = reloaded.promise;
	submitter.click();
	await expect.poll(() => reads(), poll).toBe(2);
	let frame = 0;
	let counting = true;
	const tick = () => {
		frame++;
		if (counting) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	const at: { landed?: number; cleared?: number } = {};
	const observer = new MutationObserver(() => {
		if (list.textContent === 'Ada, Grace') at.landed ??= frame;
		if (!form.hasAttribute('aria-busy')) at.cleared ??= frame;
	});
	observer.observe(container, { subtree: true, childList: true, characterData: true, attributes: true });
	expect(busy(form)).toBe('true');
	server.holdReads = undefined;
	reloaded.resolve();
	await expect.poll(() => at.cleared, poll).toBeDefined();
	await shows(container, '[data-names]', 'Ada, Grace');
	observer.disconnect();
	counting = false;
	expect(at.landed).toBeDefined();
	expect(at.cleared).toBe(at.landed);
});

test('a reload that fails still clears the form', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { form, submitter } = parts(container);
	const reloaded = deferred<void>();
	server.holdReads = reloaded.promise;
	submitter.click();
	await expect.poll(() => reads(), poll).toBe(2);
	expect(busy(form)).toBe('true');
	server.holdReads = undefined;
	reloaded.reject(new Error('Shelf unavailable'));
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(submitter.hasAttribute('aria-disabled')).toBe(false);
});

// The rule: a submit whose values differ from every submission still running starts at once, so the edit is sent exactly once.
test('a changed submission runs at once and is sent once; an identical one is held while either runs', async () => {
	const container = (await render(NoteForm)).container as HTMLElement;
	await shows(container, '[data-names]', 'Ada');
	const { form, field, submitter } = parts(container);
	const first = deferred<void>();
	const second = deferred<void>();
	server.nextPost = [{ wait: first.promise }, { wait: second.promise }];
	submitter.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	field.focus();
	await userEvent.fill(field, 'Hopper');
	await userEvent.keyboard('{Enter}');
	await expect.poll(posts, poll).toEqual(['Grace', 'Hopper']);
	await pressAgain(field, submitter);
	await userEvent.fill(field, 'Grace');
	submitter.click();
	field.value = 'Lovelace';
	await sentNext(() => submitter.click(), ['Grace', 'Hopper', 'Lovelace']);
	first.resolve();
	expect(busy(form)).toBe('true');
	expect(submitter.getAttribute('aria-disabled')).toBe('true');
	second.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(submitter.hasAttribute('aria-disabled')).toBe(false);
	await shows(container, '[data-names]', 'Ada, Lovelace, Grace, Hopper');
});

test('what a run sent is read before its handler: a handler that clears the field still holds a repeat of the original', async () => {
	const container = (await render(ClearingForm)).container as HTMLElement;
	const { form, field, submitter } = parts(container);
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }];
	submitter.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(field.value).toBe('');
	field.value = 'Grace';
	submitter.click();
	field.value = 'Hopper';
	await sentNext(() => submitter.click(), ['Grace', 'Hopper']);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});

test('several submit controls: only the pressed one is marked; another one is a new submission; both clear after the shared reload', async () => {
	const container = (await render(ChoiceForm)).container as HTMLElement;
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const keep = container.querySelector<HTMLButtonElement>('[data-keep]')!;
	const archive = container.querySelector<HTMLButtonElement>('[data-archive]')!;
	const other = container.querySelector<HTMLButtonElement>('[data-other]')!;
	const first = deferred<void>();
	const second = deferred<void>();
	server.nextPost = [{ wait: first.promise }, { wait: second.promise }];
	keep.focus();
	keep.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(keep.getAttribute('aria-disabled')).toBe('true');
	expect(archive.hasAttribute('aria-disabled')).toBe(false);
	expect(other.hasAttribute('aria-disabled')).toBe(false);
	expect(document.activeElement).toBe(keep);
	keep.click();
	await sentNext(() => archive.click(), ['keep:Mug', 'archive:Mug']);
	expect(archive.getAttribute('aria-disabled')).toBe('true');
	first.resolve();
	second.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(keep.hasAttribute('aria-disabled')).toBe(false);
	expect(archive.hasAttribute('aria-disabled')).toBe(false);
});

test('a synchronous submit handler marks nothing', async () => {
	const container = (await render(SyncForm)).container as HTMLElement;
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const marks: string[] = [];
	const observer = new MutationObserver((records) => {
		for (const record of records) marks.push(`${(record.target as Element).tagName} ${record.attributeName}`);
	});
	observer.observe(form, { subtree: true, attributeFilter: ['aria-busy', 'aria-disabled'] });
	submitter.click();
	submitter.click();
	await shows(container, '[data-sent]', '2');
	observer.disconnect();
	expect(marks).toEqual([]);
});

test('file inputs compare by their files: another file of the same name is sent, the same file is held', async () => {
	const container = (await render(FileForm)).container as HTMLElement;
	const { form, submitter } = parts(container);
	const input = container.querySelector<HTMLInputElement>('[data-file]')!;
	const choose = (...files: File[]) => {
		const transfer = new DataTransfer();
		for (const file of files) transfer.items.add(file);
		input.files = transfer.files;
	};
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }, { wait: answer.promise }];
	choose(new File(['a'], 'note.txt'));
	submitter.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	choose(new File(['a'], 'note.txt', { lastModified: (input.files![0]!).lastModified }));
	submitter.click();
	choose(new File(['bigger'], 'note.txt'));
	await sentNext(() => submitter.click(), ['note.txt:1', 'note.txt:6']);
	choose(new File(['bigger'], 'note.txt'), new File(['b'], 'more.txt'));
	await sentNext(() => submitter.click(), ['note.txt:1', 'note.txt:6', 'note.txt:6,more.txt:1']);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});

test('image buttons are told apart from each other and from a submit with no button; requestSubmit() repeats are held', async () => {
	const container = (await render(ImageForm)).container as HTMLElement;
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const map = container.querySelector<HTMLInputElement>('[data-map]')!;
	const globe = container.querySelector<HTMLInputElement>('[data-globe]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }, { wait: answer.promise }];
	map.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(map.getAttribute('aria-disabled')).toBe('true');
	map.click();
	await sentNext(() => globe.click(), ['map', 'globe']);
	await sentNext(() => form.requestSubmit(), ['map', 'globe', 'none']);
	form.requestSubmit();
	globe.click();
	map.click();
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	await sentNext(() => map.click(), ['map', 'globe', 'none', 'map']);
});

test('multi-selects, radio groups and controls outside the form with form= each make a new submission', async () => {
	const container = (await render(ControlsForm)).container as HTMLElement;
	const form = container.querySelector<HTMLFormElement>('[data-form]')!;
	const submitter = container.querySelector<HTMLButtonElement>('[data-submit]')!;
	const answer = deferred<void>();
	server.nextPost = Array.from({ length: 4 }, () => ({ wait: answer.promise }));
	submitter.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	submitter.click();
	container.querySelector<HTMLSelectElement>('[data-size]')!.options[1]!.selected = true;
	await sentNext(() => submitter.click(), ['s|box|none', 's+m|box|none']);
	container.querySelector<HTMLInputElement>('[data-bag]')!.checked = true;
	await sentNext(() => submitter.click(), ['s|box|none', 's+m|box|none', 's+m|bag|none']);
	container.querySelector<HTMLInputElement>('[data-note]')!.value = 'gift';
	submitter.click();
	await expect.poll(posts, poll).toEqual(['s|box|none', 's+m|box|none', 's+m|bag|none', 's+m|bag|gift']);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});

// Pinned: a form-associated custom element's value set only through ElementInternals is not read, so a change to it alone is held as a repeat.
test('a custom element value set only through ElementInternals is not seen by the repeat hold', async () => {
	class RatingField extends HTMLElement {
		static formAssociated = true;
		readonly internals = this.attachInternals();
		rate(value: string) {
			this.internals.setFormValue(value);
		}
	}
	if (!customElements.get('rating-field')) customElements.define('rating-field', RatingField);
	const container = (await render(CustomFieldForm)).container as HTMLElement;
	const { form, submitter } = parts(container);
	const rating = container.querySelector('[data-rating]') as RatingField;
	rating.rate('3');
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	submitter.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	rating.rate('5');
	submitter.click();
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	await sentNext(() => submitter.click(), ['3', '5']);
});

test('a submit handler on an element around the form holds the form', async () => {
	const container = (await render(AroundForm)).container as HTMLElement;
	const { form, submitter } = parts(container);
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	submitter.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(container.querySelector('[data-around]')!.hasAttribute('aria-busy')).toBe(false);
	expect(submitter.getAttribute('aria-disabled')).toBe('true');
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});

test('an async handler a parent passes as a prop holds the child component form', async () => {
	const container = (await render(PropForm)).container as HTMLElement;
	const { form, submitter } = parts(container);
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	submitter.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	submitter.click();
	await expect.poll(posts, poll).toEqual(['prop']);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	await sentNext(() => submitter.click(), ['prop', 'prop']);
});

test('a form removed while its submission runs ends cleanly, and a new form submits', async () => {
	const container = (await render(RemovedForm)).container as HTMLElement;
	const first = parts(container).submitter;
	const removed = parts(container).form;
	first.click();
	await expect.poll(posts, poll).toEqual(['gone']);
	await expect.poll(() => container.querySelector('[data-form]'), poll).toBe(null);
	await expect.poll(() => removed.hasAttribute('aria-busy'), poll).toBe(false);
	container.querySelector<HTMLButtonElement>('[data-reopen]')!.click();
	await expect.poll(() => container.querySelector('[data-form]'), poll).not.toBe(null);
	await sentNext(() => parts(container).submitter.click(), ['gone', 'gone']);
});

// Pinned: nothing ends a promise that does not settle, so its form stays busy and only a changed submission is sent.
test('a handler promise that does not settle keeps the form busy; a changed submission still goes', async () => {
	const gate = deferred<void>();
	const never = { started: 0, gate: gate.promise };
	(globalThis as { __never?: typeof never }).__never = never;
	const container = (await render(NeverForm)).container as HTMLElement;
	const { form, field, submitter } = parts(container);
	try {
		submitter.click();
		await expect.poll(() => busy(form), poll).toBe('true');
		submitter.click();
		field.value = 'Hopper';
		submitter.click();
		await expect.poll(() => never.started, poll).toBe(2);
		expect(busy(form)).toBe('true');
	} finally {
		gate.resolve();
	}
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
});

test('the form keeps aria-busy while either its submission or a reload of the value it shows is running', async () => {
	const container = (await render(OwnersForm)).container as HTMLElement;
	await shows(container, '[data-count]', '1');
	const { form, submitter } = parts(container);
	const count = container.querySelector('[data-count]')!;
	const page = container.querySelector<HTMLButtonElement>('[data-page]')!;
	const cleared: number[] = [];
	const observer = new MutationObserver(() => !form.hasAttribute('aria-busy') && cleared.push(1));
	observer.observe(form, { attributeFilter: ['aria-busy'] });
	const handler = deferred<void>();
	server.handlerWait = handler.promise;
	try {
		submitter.click();
		await expect.poll(() => busy(form), poll).toBe('true');
		const first = deferred<void>();
		server.holdReads = first.promise;
		page.click();
		await expect.poll(() => count.getAttribute('aria-busy'), poll).toBe('true');
		server.holdReads = undefined;
		first.resolve();
		await expect.poll(() => count.hasAttribute('aria-busy'), poll).toBe(false);
		expect(busy(form)).toBe('true');
		expect(cleared).toEqual([]);
		const second = deferred<void>();
		server.holdReads = second.promise;
		page.click();
		await expect.poll(() => count.getAttribute('aria-busy'), poll).toBe('true');
		handler.resolve();
		await expect.poll(() => submitter.hasAttribute('aria-disabled'), poll).toBe(false);
		expect(busy(form)).toBe('true');
		expect(cleared).toEqual([]);
		server.holdReads = undefined;
		second.resolve();
		await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	} finally {
		handler.resolve();
		observer.disconnect();
	}
});

test('an author-bound aria-disabled keeps the author value through a run and after it, true or false', async () => {
	const container = (await render(AuthoredForm)).container as HTMLElement;
	const form = container.querySelector<HTMLFormElement>('[data-bound-form]')!;
	const bound = container.querySelector<HTMLButtonElement>('[data-bound]')!;
	const unbound = container.querySelector<HTMLButtonElement>('[data-unbound]')!;
	const lock = container.querySelector<HTMLButtonElement>('[data-lock]')!;
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }, { wait: answer.promise }];
	expect(bound.getAttribute('aria-disabled')).toBe('false');
	bound.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	expect(bound.getAttribute('aria-disabled')).toBe('false');
	lock.click();
	await expect.poll(() => bound.getAttribute('aria-disabled'), poll).toBe('true');
	unbound.click();
	await expect.poll(posts, poll).toEqual(['bound', 'bound']);
	expect(unbound.hasAttribute('aria-disabled')).toBe(false);
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	expect(bound.getAttribute('aria-disabled')).toBe('true');
	lock.click();
	await expect.poll(() => bound.getAttribute('aria-disabled'), poll).toBe('false');
});

test('a static aria-disabled="true" submit control is never flipped', async () => {
	const container = (await render(AuthoredForm)).container as HTMLElement;
	const form = container.querySelector<HTMLFormElement>('[data-static-form]')!;
	const control = container.querySelector<HTMLButtonElement>('[data-static]')!;
	const flips: Array<string | null> = [];
	const observer = new MutationObserver(() => flips.push(control.getAttribute('aria-disabled')));
	observer.observe(control, { attributeFilter: ['aria-disabled'] });
	const answer = deferred<void>();
	server.nextPost = [{ wait: answer.promise }];
	control.click();
	await expect.poll(() => busy(form), poll).toBe('true');
	answer.resolve();
	await expect.poll(() => form.hasAttribute('aria-busy'), poll).toBe(false);
	observer.disconnect();
	expect(flips).toEqual([]);
	expect(control.getAttribute('aria-disabled')).toBe('true');
});

// Measured, not Markless behaviour: which way of blocking a button keeps keyboard focus on it.
test('disabling a focused button drops its focus; aria-disabled keeps it', async () => {
	const form = document.createElement('form');
	const button = document.createElement('button');
	form.append(button);
	document.body.append(form);
	button.focus();
	button.setAttribute('aria-disabled', 'true');
	await new Promise((resolve) => requestAnimationFrame(resolve));
	const ariaKeeps = document.activeElement === button;
	button.removeAttribute('aria-disabled');
	button.disabled = true;
	await new Promise((resolve) => requestAnimationFrame(resolve));
	const disabledKeeps = document.activeElement === button;
	button.disabled = false;
	const back = document.activeElement === button;
	form.remove();
	expect({ ariaKeeps, disabledKeeps, back }).toEqual({ ariaKeeps: true, disabledKeeps: false, back: false });
});

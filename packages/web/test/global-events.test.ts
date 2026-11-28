import { afterEach, beforeEach, expect, test } from 'vitest';
import { PROTOCOL_GLOBAL_EVENT_ENTER as ENTER } from '@markless/serializer/protocol-global-events';
import {
	createInlineGlobalRelaySource,
	globalEventNames,
	relayGlobalEvents,
} from '../src/inline/global-relay.ts';

// onDocument*/onWindow* listen through one relay per record name for the whole
// document: each event becomes a CustomEvent raised at every owner still on the
// page, which the container routes like any element event.

type Listener = { readonly type: string; readonly listener: (event: unknown) => unknown; readonly options?: unknown };
type FakeTarget = { readonly listeners: Listener[]; addEventListener(type: string, listener: (event: unknown) => unknown, options?: unknown): void };
type Owner = { readonly name: string; readonly owns: string; readonly received: CustomEvent[]; dispatchEvent(event: CustomEvent): boolean };

const target = (): FakeTarget => ({
	listeners: [],
	addEventListener(type, listener, options) {
		this.listeners.push({ type, listener, options });
	},
});
const owner = (name: string, owns: string): Owner => ({
	name,
	owns,
	received: [],
	dispatchEvent(event) {
		this.received.push(event);
		return true;
	},
});

let owners: Owner[];
let fakeDocument: FakeTarget & { querySelectorAll(selector: string): Owner[]; __mGR?: Set<string>; __mEG?: unknown };
let fakeWindow: FakeTarget;
beforeEach(() => {
	owners = [];
	fakeWindow = target();
	fakeDocument = Object.assign(target(), {
		// The relay asks for `[m\:g~="<name>"]`: owners whose space-separated list holds the name.
		querySelectorAll(selector: string) {
			const name = /~="([^"]+)"/.exec(selector)![1]!;
			return owners.filter((candidate) => candidate.owns.split(' ').includes(name));
		},
	});
	Object.assign(globalThis, {
		document: fakeDocument,
		window: fakeWindow,
		CSS: { escape: (value: string) => value.replace(':', '\\:') },
	});
});
afterEach(() => {
	for (const name of ['document', 'window', 'CSS']) delete (globalThis as Record<string, unknown>)[name];
});

const keydown = (key: string) => {
	const event = new Event('keydown') as Event & { key: string };
	event.key = key;
	return event;
};

test('one listener per name on the document or window, passive where the browser makes it so, installed once', () => {
	relayGlobalEvents(['document.keydown', 'window.scroll'], 'm:g', ['scroll'], ENTER);
	relayGlobalEvents(['document.keydown'], 'm:g', ['scroll'], ENTER);
	expect(fakeDocument.listeners.map((entry) => [entry.type, entry.options])).toEqual([['keydown', { passive: false }]]);
	expect(fakeWindow.listeners.map((entry) => [entry.type, entry.options])).toEqual([['scroll', { passive: true }]]);
});

test('every owner still on the page gets the browser event as detail, in document order, and only owners of that name', () => {
	owners.push(owner('dialog', 'document.keydown'), owner('panel', 'window.resize'), owner('aside', 'window.resize document.keydown'));
	relayGlobalEvents(['document.keydown'], 'm:g', [], ENTER);
	const event = keydown('Escape');
	fakeDocument.listeners[0]!.listener(event);
	expect(owners.map((each) => each.received.length)).toEqual([1, 0, 1]);
	const carrier = owners[0]!.received[0]!;
	expect(carrier.type).toBe('document.keydown');
	expect(carrier.detail).toBe(event);
	expect(carrier.bubbles).toBe(false);

	owners.splice(0, 1);
	fakeDocument.listeners[0]!.listener(keydown('a'));
	expect(owners.map((each) => each.received.length)).toEqual([0, 2]);
});

test('a sync policy run on the carrier reads and cancels the browser event', () => {
	owners.push(owner('dialog', 'document.keydown'));
	relayGlobalEvents(['document.keydown'], 'm:g', [], ENTER);
	const event = new Event('keydown', { cancelable: true }) as Event & { key: string };
	event.key = 'Escape';
	fakeDocument.listeners[0]!.listener(event);
	const carrier = owners[0]!.received[0]! as CustomEvent & { key?: string };
	expect(carrier.key).toBe('Escape');
	carrier.preventDefault();
	expect(event.defaultPrevented).toBe(true);
});

// A handler's code usually runs after the browser's dispatch: each compiled handler calls the
// carrier's enter function first, and these tests call it in the order the dispatch queue would.
const enter = (carrier: CustomEvent | undefined) =>
	(carrier as unknown as Record<string, () => boolean>)[ENTER]!();

const pressThrough = (event: Event) => {
	fakeDocument.listeners[0]!.listener(event);
	fakeWindow.listeners[0]?.listener(event);
};

test('a document owner stopPropagation keeps the event from window owners but not from the other document owners', () => {
	owners.push(owner('first', 'document.keydown'), owner('second', 'document.keydown'), owner('late', 'window.keydown'));
	relayGlobalEvents(['document.keydown', 'window.keydown'], 'm:g', [], ENTER);
	const event = keydown('a');
	pressThrough(event);
	const [first, second, late] = owners.map((each) => each.received[0]);
	expect(enter(first)).toBe(true);
	event.stopPropagation();
	expect(enter(second)).toBe(true);
	expect(enter(late)).toBe(false);
});

test('stopImmediatePropagation keeps the event from the owners after that one and from window owners', () => {
	owners.push(owner('first', 'document.keydown'), owner('second', 'document.keydown'), owner('late', 'window.keydown'));
	relayGlobalEvents(['document.keydown', 'window.keydown'], 'm:g', [], ENTER);
	const event = keydown('a');
	pressThrough(event);
	const [first, second, late] = owners.map((each) => each.received[0]);
	expect(enter(first)).toBe(true);
	event.stopImmediatePropagation();
	expect(enter(second)).toBe(false);
	expect(enter(late)).toBe(false);
});

test('a stop from an element handler keeps the event from every document and window owner', () => {
	owners.push(owner('first', 'document.keydown'), owner('late', 'window.keydown'));
	relayGlobalEvents(['document.keydown', 'window.keydown'], 'm:g', [], ENTER);
	const event = keydown('s');
	pressThrough(event);
	event.stopPropagation();
	expect(owners.map((each) => enter(each.received[0]))).toEqual([false, false]);
});

test('an owner whose sync policy stops the event still runs its own handler, and an immediate stop there skips only later owners', () => {
	const stopper = owner('stopper', 'document.keydown');
	stopper.dispatchEvent = function (carrier) {
		this.received.push(carrier);
		carrier.stopImmediatePropagation();
		return true;
	};
	owners.push(owner('before', 'document.keydown'), stopper, owner('after', 'document.keydown'));
	relayGlobalEvents(['document.keydown'], 'm:g', [], ENTER);
	pressThrough(keydown('Escape'));
	expect(owners.map((each) => each.received.length)).toEqual([1, 1, 0]);
	expect(enter(owners[0]!.received[0])).toBe(true);
	expect(enter(stopper.received[0])).toBe(true);
});

test('the handler sees the document or window as currentTarget, as a listener there does', () => {
	owners.push(owner('dialog', 'document.keydown window.keydown'));
	relayGlobalEvents(['document.keydown', 'window.keydown'], 'm:g', [], ENTER);
	const event = keydown('a');
	pressThrough(event);
	const [onDocument, onWindow] = owners[0]!.received;
	enter(onDocument);
	expect(event.currentTarget).toBe(fakeDocument);
	enter(onWindow);
	expect(event.currentTarget).toBe(fakeWindow);
});

test('an event that landed while the shell parsed is replayed to the owners', () => {
	owners.push(owner('dialog', 'document.keydown'));
	const early = keydown('Escape');
	fakeDocument.__mEG = [['document.keydown', early]];
	relayGlobalEvents(['document.keydown'], 'm:g', [], ENTER);
	expect(owners[0]!.received[0]!.detail).toBe(early);
});

test('a served page ships the relay only when its records name a document or window event', () => {
	expect(globalEventNames(['click', 'idle', 'document.keydown', 'window.resize'])).toEqual(['document.keydown', 'window.resize']);
	expect(createInlineGlobalRelaySource(['click', 'keydown', 'visible'])).toBe('');
	const source = createInlineGlobalRelaySource(['click', 'document.keydown']);
	expect(source).toContain('["document.keydown"]');
	expect(source).toContain('"m:g"');
});

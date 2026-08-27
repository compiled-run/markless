import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { installOverlayBehavior } from '../src/fns/overlay.ts';
import type { OverlayDismissDetail } from '../src/fns/overlay.ts';

// The overlay stack outlives every root that pushed onto it: it is one module
// global, and only its topmost entry receives a dismissal. These rows pin what
// happens when that top is a corpse - an element torn down while still enlisted -
// and what happens to a gesture that arrives with nothing live to report it to.
// Both are ordering faults a real page produces by navigating or unmounting, and
// both used to end with the reader's press vanishing.

type FakeDocument = {
	activeElement: FakeElement | undefined;
	body: undefined;
	readonly listeners: Array<{
		readonly type: string;
		readonly listener: (event: unknown) => void;
	}>;
	addEventListener(type: string, listener: (event: unknown) => void): void;
	removeEventListener(type: string, listener: (event: unknown) => void): void;
};

type FakeElement = {
	readonly nodeType: 1;
	hidden: boolean;
	isConnected: boolean;
	readonly marked: boolean;
	readonly dismissals: OverlayDismissDetail[];
	readonly ownerDocument: FakeDocument;
	matches(selector: string): boolean;
	querySelector(selector: string): null;
	contains(node: unknown): boolean;
	dispatchEvent(event: Event): boolean;
};

type FakeRoot = {
	readonly ownerDocument: FakeDocument;
	readonly children: FakeElement[];
	__marklessOverlayHiddenBound?: ReadonlyArray<unknown>;
	__marklessOverlayPrimedDismissal?: 'escape' | 'outside-press';
	querySelector(selector: string): FakeElement | null;
	contains(node: unknown): boolean;
};

type PrimerHost = { __marklessOverlayPrimedDismissal?: 'escape' | 'outside-press' };

function fakeDocument(): FakeDocument {
	return {
		activeElement: undefined,
		body: undefined,
		listeners: [],
		addEventListener(type, listener) {
			this.listeners.push({ type, listener });
		},
		removeEventListener(type, listener) {
			const index = this.listeners.findIndex(
				(entry) => entry.type === type && entry.listener === listener,
			);
			if (index >= 0) this.listeners.splice(index, 1);
		},
	};
}

// The behaviour asks `target instanceof Element` and `instanceof Node`, which a
// node run has no answer for at all, so the fakes are real instances of one stub.
class StubNode {}

function surface(owner: FakeDocument, marked = true, holds: FakeElement[] = []): FakeElement {
	return Object.assign(new StubNode(), {
		nodeType: 1 as const,
		hidden: false,
		isConnected: true,
		marked,
		dismissals: [] as OverlayDismissDetail[],
		ownerDocument: owner,
		matches(selector: string): boolean {
			// Marked, never modal: modality is a separate mechanism and these rows
			// are about which entry a dismissal reaches.
			return selector === '[overlay]' && marked;
		},
		querySelector(): null {
			return null;
		},
		contains(node: unknown): boolean {
			return node === this || holds.includes(node as FakeElement);
		},
		dispatchEvent(event: Event): boolean {
			this.dismissals.push((event as CustomEvent<OverlayDismissDetail>).detail);
			return true;
		},
	}) as unknown as FakeElement;
}

function root(owner: FakeDocument, children: FakeElement[]): FakeRoot {
	const node: FakeRoot = {
		ownerDocument: owner,
		children,
		querySelector(selector) {
			return children.find((child) => child.matches(selector)) ?? null;
		},
		contains(candidate) {
			return children.includes(candidate as FakeElement);
		},
	};
	// The runtime's handoff: every element in this root whose `hidden` is bound.
	// A served-open surface enlists because of it, not because of a flip.
	node.__marklessOverlayHiddenBound = children;
	return node;
}

const teardowns: Array<() => void> = [];

function install(node: FakeRoot): (() => void) | undefined {
	const teardown = installOverlayBehavior(node as unknown as Element);
	if (teardown) teardowns.push(teardown);
	return teardown;
}

// Copied before iterating: pruning the last entry stops the listening, which
// removes the very entries this is walking.
function pressEscape(owner: FakeDocument): void {
	for (const entry of owner.listeners.slice())
		if (entry.type === 'keydown') entry.listener({ key: 'Escape', defaultPrevented: false });
}

function pressDown(owner: FakeDocument, target: FakeElement): void {
	for (const entry of owner.listeners.slice())
		if (entry.type === 'pointerdown') entry.listener({ target });
}

class StubMutationObserver {
	observe(): void {}
	disconnect(): void {}
}

const globalHost = globalThis as PrimerHost;

beforeEach(() => {
	vi.stubGlobal('MutationObserver', StubMutationObserver);
	vi.stubGlobal('Element', StubNode);
	vi.stubGlobal('Node', StubNode);
});

afterEach(() => {
	for (const teardown of teardowns.splice(0).reverse()) teardown();
	globalHost.__marklessOverlayPrimedDismissal = undefined;
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test('a corpse at the top of the stack is pruned and reported, and the dismissal reaches the live entry below it', () => {
	const owner = fakeDocument();
	const report = vi.spyOn(console, 'error').mockImplementation(() => {});
	const live = surface(owner);
	const tornDown = surface(owner);
	install(root(owner, [live]));
	install(root(owner, [tornDown]));

	// The documented contract is that an enlisted element is still attached when
	// it hides. This one was removed while enlisted, so it is topmost and dead.
	tornDown.isConnected = false;
	pressEscape(owner);

	expect(tornDown.dismissals).toEqual([]);
	expect(live.dismissals).toEqual([{ reason: 'escape' }]);
	// The repair is not silent: whoever tore the element down broke the contract.
	expect(report).toHaveBeenCalledTimes(1);
	expect(report.mock.calls[0]?.at(-1)).toBe(tornDown);
});

test('a keyed replay is consumed by the root it was primed for, never by another root installing first', () => {
	const owner = fakeDocument();
	const stale = surface(owner);
	const served = surface(owner);
	const staleRoot = root(owner, [stale]);
	const servedRoot = root(owner, [served]);

	// The Escape arrived before this root's behaviour was loaded, so its own
	// resumer left the reason on it.
	servedRoot.__marklessOverlayPrimedDismissal = 'escape';

	// Another root installs first in the same tick. Its surface is live and would
	// be topmost, so a primer that belonged to nobody would be spent here.
	install(staleRoot);
	expect(stale.dismissals).toEqual([]);

	install(servedRoot);
	expect(served.dismissals).toEqual([{ reason: 'escape' }]);
	expect(stale.dismissals).toEqual([]);
	expect(servedRoot.__marklessOverlayPrimedDismissal).toBeUndefined();
});

test('a dismissal with no live top primes itself and the next install replays it', () => {
	const owner = fakeDocument();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const tornDown = surface(owner);
	install(root(owner, [tornDown]));

	tornDown.isConnected = false;
	pressEscape(owner);
	expect(tornDown.dismissals).toEqual([]);
	// Not lost: a gesture the reader actually made waits for something live.
	expect(globalHost.__marklessOverlayPrimedDismissal).toBe('escape');

	const next = surface(owner);
	install(root(owner, [next]));
	expect(next.dismissals).toEqual([{ reason: 'escape' }]);
	expect(globalHost.__marklessOverlayPrimedDismissal).toBeUndefined();
});

test('a root installing with nothing live hands the replay back instead of eating it', () => {
	const owner = fakeDocument();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	globalHost.__marklessOverlayPrimedDismissal = 'escape';

	const corpse = surface(owner);
	corpse.isConnected = false;
	install(root(owner, [corpse]));
	expect(corpse.dismissals).toEqual([]);
	expect(globalHost.__marklessOverlayPrimedDismissal).toBe('escape');

	const live = surface(owner);
	install(root(owner, [live]));
	expect(live.dismissals).toEqual([{ reason: 'escape' }]);
});

test('a primed press is not replayed onto a surface it landed inside of', () => {
	const owner = fakeDocument();
	vi.spyOn(console, 'error').mockImplementation(() => {});
	const tornDown = surface(owner);
	install(root(owner, [tornDown]));
	tornDown.isConnected = false;

	// The press that wakes a page served with an open surface usually lands
	// inside that surface. Nothing was on the stack to ask when it landed, so the
	// question is asked when the replay finally has an addressee.
	const inside = surface(owner, false);
	const served = surface(owner, true, [inside]);
	pressDown(owner, inside);
	expect(globalHost.__marklessOverlayPrimedDismissal).toBe('outside-press');

	install(root(owner, [served]));
	expect(served.dismissals).toEqual([]);
	expect(globalHost.__marklessOverlayPrimedDismissal).toBeUndefined();
});

test('a page with no marked element leaves a primed dismissal unconsumed', () => {
	const owner = fakeDocument();
	globalHost.__marklessOverlayPrimedDismissal = 'escape';

	const plain = surface(owner, false);
	expect(install(root(owner, [plain]))).toBeUndefined();
	expect(globalHost.__marklessOverlayPrimedDismissal).toBe('escape');

	const live = surface(owner);
	install(root(owner, [live]));
	expect(live.dismissals).toEqual([{ reason: 'escape' }]);
});

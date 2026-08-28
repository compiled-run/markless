import { expect, test } from 'vitest';
import {
	marklessBeginFocusCommit,
	marklessEndFocusCommit,
	marklessHandleFocusReader,
} from '../src/resume-events.ts';
import type { ResumeElementHandleValue } from '../src/resume-types.ts';

/**
 * Dispatches overlap. A menubar item opens its surface by dispatching a
 * synthetic key event into it, so a second focus-commit window is open inside
 * the first, and an overlay reopened under a storm of gestures has two windows
 * open with neither nested cleanly inside the other. Each window holds the focus
 * its own handler was refused, and only its own commit lands it.
 *
 * The fakes refuse focus the way a hidden or inert target does: silently,
 * leaving the active element where it was.
 */

type FakeDocument = { activeElement: unknown };

type FakeElement = {
	readonly name: string;
	hidden: boolean;
	isConnected: boolean;
	readonly ownerDocument: FakeDocument;
	focus: (options?: { readonly preventScroll?: boolean }) => void;
};

function makeElement(name: string, owner: FakeDocument, hidden = true): FakeElement {
	const element: FakeElement = {
		name,
		hidden,
		isConnected: true,
		ownerDocument: owner,
		focus() {
			if (!element.hidden) owner.activeElement = element;
		},
	};
	return element;
}

/** Hands the element out the way a dispatch's handle reader does, shim and all. */
function handOut(element: FakeElement): FakeElement {
	const read = marklessHandleFocusReader(() => element as unknown as ResumeElementHandleValue);
	return read(element.name) as unknown as FakeElement;
}

test('a nested dispatch’s hold does not displace the dispatch that opened it', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const outerTarget = makeElement('outer', owner);
	const innerTarget = makeElement('inner', owner);

	const outer = marklessBeginFocusCommit();
	handOut(outerTarget).focus();

	// The outer handler dispatches a synthetic event, which opens its own window.
	const inner = marklessBeginFocusCommit();
	handOut(innerTarget).focus();
	innerTarget.hidden = false;
	marklessEndFocusCommit(inner);
	expect(owner.activeElement).toBe(innerTarget);

	outerTarget.hidden = false;
	marklessEndFocusCommit(outer);
	expect(owner.activeElement).toBe(outerTarget);
});

test('two overlapping dispatches each replay their own hold on their own commit', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const first = makeElement('first', owner);
	const second = makeElement('second', owner);

	const dispatchA = marklessBeginFocusCommit();
	handOut(first).focus();
	const dispatchB = marklessBeginFocusCommit();
	handOut(second).focus();

	first.hidden = false;
	marklessEndFocusCommit(dispatchA);
	expect(owner.activeElement).toBe(first);

	second.hidden = false;
	marklessEndFocusCommit(dispatchB);
	expect(owner.activeElement).toBe(second);
});

test('a dispatch that ends holding nothing leaves another dispatch’s hold alone', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const target = makeElement('target', owner);

	const quiet = marklessBeginFocusCommit();
	const holding = marklessBeginFocusCommit();
	handOut(target).focus();

	marklessEndFocusCommit(quiet);
	expect(owner.activeElement).toBe('body');

	target.hidden = false;
	marklessEndFocusCommit(holding);
	expect(owner.activeElement).toBe(target);
});

// What is per dispatch is the hold, not the window: one pointer names the
// dispatch a refusal is held under, and a nested dispatch closing it leaves the
// dispatch around it holding nothing - as it did before holds were split.
test('a nested dispatch closing the window does not reopen it for the dispatch around it', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const target = makeElement('target', owner);

	const outer = marklessBeginFocusCommit();
	marklessEndFocusCommit(marklessBeginFocusCommit());

	handOut(target).focus();
	target.hidden = false;
	marklessEndFocusCommit(outer);

	expect(owner.activeElement).toBe('body');
});

test('within one dispatch the last refused focus is the one that lands', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const early = makeElement('early', owner);
	const late = makeElement('late', owner);

	const dispatch = marklessBeginFocusCommit();
	handOut(early).focus();
	handOut(late).focus();

	early.hidden = false;
	late.hidden = false;
	marklessEndFocusCommit(dispatch);

	expect(owner.activeElement).toBe(late);
});

test('a hold whose target left the document is skipped without touching another dispatch’s', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const detached = makeElement('detached', owner);
	const kept = makeElement('kept', owner);

	const dropping = marklessBeginFocusCommit();
	handOut(detached).focus();
	const landing = marklessBeginFocusCommit();
	handOut(kept).focus();

	detached.hidden = false;
	detached.isConnected = false;
	marklessEndFocusCommit(dropping);
	expect(owner.activeElement).toBe('body');

	kept.hidden = false;
	marklessEndFocusCommit(landing);
	expect(owner.activeElement).toBe(kept);
});

test('a focus that took is not replayed at the commit', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const taken = makeElement('taken', owner, false);
	const other = makeElement('other', owner, false);

	const dispatch = marklessBeginFocusCommit();
	handOut(taken).focus();
	owner.activeElement = other;
	marklessEndFocusCommit(dispatch);

	expect(owner.activeElement).toBe(other);
});

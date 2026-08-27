import { expect, test } from 'vitest';
import {
	marklessBeginFocusCommit,
	marklessEndFocusCommit,
	marklessHandleFocusReader,
} from '../../src/resume-events.ts';
import type { ResumeElementHandleValue } from '../../src/resume-types.ts';

/**
 * An overlay's closing handler asks for focus on an element it has no handle
 * for: the reading the overlay behaviour took at enlist, left on the surface as
 * `__marklessOverlayFocusOrigin`. The background is still marked when the
 * handler asks - the behaviour lifts the marks after the hide commits - so the
 * call is refused, and holding it depends on the runtime having handed that
 * element out. Handing out the surface is the only moment it can.
 *
 * The fake below refuses focus exactly the way an inert target does: silently,
 * leaving the active element where it was.
 */

type FakeDocument = { activeElement: unknown };

type FakeElement = {
	readonly name: string;
	inert: boolean;
	isConnected: boolean;
	readonly ownerDocument: FakeDocument;
	focus: () => void;
	__marklessOverlayFocusOrigin?: FakeElement;
};

function makeElement(name: string, owner: FakeDocument, inert = false): FakeElement {
	const element: FakeElement = {
		name,
		inert,
		isConnected: true,
		ownerDocument: owner,
		focus() {
			if (!element.inert) owner.activeElement = element;
		},
	};
	return element;
}

function readerFor(value: FakeElement | ReadonlyArray<FakeElement>) {
	return marklessHandleFocusReader(() => value as unknown as ResumeElementHandleValue);
}

test('a focus refused on the surface’s captured origin lands once the mark is lifted', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const origin = makeElement('origin', owner, true);
	const surface = makeElement('surface', owner);
	surface.__marklessOverlayFocusOrigin = origin;

	const read = readerFor(surface);
	const dispatch = marklessBeginFocusCommit();
	const handedOut = read('surface') as unknown as FakeElement;
	handedOut.__marklessOverlayFocusOrigin?.focus();
	expect(owner.activeElement).toBe('body');

	// What the overlay behaviour does after the hide reaches the DOM.
	origin.inert = false;
	marklessEndFocusCommit(dispatch);

	expect(owner.activeElement).toBe(origin);
});

test('the origin is reached on every read, not only the one that shimmed the surface', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const surface = makeElement('surface', owner);

	// The opening dispatch reads the surface handle before anything has enlisted,
	// so there is no origin to reach yet.
	const read = readerFor(surface);
	const opening = marklessBeginFocusCommit();
	read('surface');
	marklessEndFocusCommit(opening);

	const origin = makeElement('origin', owner, true);
	surface.__marklessOverlayFocusOrigin = origin;

	const closing = marklessBeginFocusCommit();
	const handedOut = read('surface') as unknown as FakeElement;
	handedOut.__marklessOverlayFocusOrigin?.focus();
	origin.inert = false;
	marklessEndFocusCommit(closing);

	expect(owner.activeElement).toBe(origin);
});

test('a captured origin reached from a plural handle is held the same way', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const origin = makeElement('origin', owner, true);
	const surface = makeElement('surface', owner);
	surface.__marklessOverlayFocusOrigin = origin;

	const read = readerFor([surface]);
	const dispatch = marklessBeginFocusCommit();
	const handedOut = read('surfaces') as unknown as ReadonlyArray<FakeElement>;
	handedOut[0]?.__marklessOverlayFocusOrigin?.focus();
	origin.inert = false;
	marklessEndFocusCommit(dispatch);

	expect(owner.activeElement).toBe(origin);
});

test('a refusal outside any dispatch is not replayed', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const origin = makeElement('origin', owner, true);
	const surface = makeElement('surface', owner);
	surface.__marklessOverlayFocusOrigin = origin;

	const read = readerFor(surface);
	const dispatch = marklessBeginFocusCommit();
	read('surface');
	marklessEndFocusCommit(dispatch);

	origin.focus();
	origin.inert = false;
	marklessEndFocusCommit(marklessBeginFocusCommit());

	expect(owner.activeElement).toBe('body');
});

test('an origin detached before the commit is left alone', () => {
	const owner: FakeDocument = { activeElement: 'body' };
	const origin = makeElement('origin', owner, true);
	const surface = makeElement('surface', owner);
	surface.__marklessOverlayFocusOrigin = origin;

	const read = readerFor(surface);
	const dispatch = marklessBeginFocusCommit();
	const handedOut = read('surface') as unknown as FakeElement;
	handedOut.__marklessOverlayFocusOrigin?.focus();
	origin.inert = false;
	origin.isConnected = false;
	marklessEndFocusCommit(dispatch);

	expect(owner.activeElement).toBe('body');
});

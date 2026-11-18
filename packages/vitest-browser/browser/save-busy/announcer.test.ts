import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { REFRESH_ANNOUNCEMENT, refreshChanged } from '../../../web/src/fns/refresh-announcer.ts';

// The shared announcer counts busy blocks by their anchors: content a block re-renders while busy does not end its share.
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	vi.useRealTimers();
	document.body.replaceChildren();
});

const region = () => document.querySelector('[data-markless-announcer]')?.textContent;

function block(name: string) {
	const anchor = document.createComment(name);
	const shown = document.createElement('p');
	document.body.append(anchor, shown);
	return { key: {}, anchor, shown };
}

test('a block whose content re-rendered while busy keeps the closing line back until its own marks clear', () => {
	const a = block('a');
	const b = block('b');
	refreshChanged(a.key, true, undefined, [a.shown], a.anchor);
	refreshChanged(b.key, true, undefined, [b.shown], b.anchor);
	vi.advanceTimersByTime(1_000);
	expect(region()).toBe(REFRESH_ANNOUNCEMENT.busy);
	a.shown.remove();
	refreshChanged(b.key, false, undefined, [b.shown], b.anchor);
	vi.advanceTimersByTime(1_000);
	expect(region()).toBe(REFRESH_ANNOUNCEMENT.busy);
	const redrawn = document.createElement('p');
	document.body.append(redrawn);
	refreshChanged(a.key, false, undefined, [redrawn], a.anchor);
	vi.advanceTimersByTime(1_000);
	expect(region()).toBe(REFRESH_ANNOUNCEMENT.settled);
});

test('a block whose anchor left the page no longer keeps the closing line back', () => {
	const a = block('a');
	const b = block('b');
	refreshChanged(a.key, true, undefined, [a.shown], a.anchor);
	refreshChanged(b.key, true, undefined, [b.shown], b.anchor);
	vi.advanceTimersByTime(1_000);
	a.anchor.remove();
	a.shown.remove();
	refreshChanged(b.key, false, undefined, [b.shown], b.anchor);
	vi.advanceTimersByTime(1_000);
	expect(region()).toBe(REFRESH_ANNOUNCEMENT.settled);
});

test('a silent close, for a page left behind, drops a busy line not yet said and says nothing', () => {
	const a = block('a');
	refreshChanged(a.key, true, undefined, [a.shown], a.anchor);
	refreshChanged(a.key, false, 'silent', [a.shown], a.anchor);
	vi.advanceTimersByTime(2_000);
	expect(region() ?? '').toBe('');
});

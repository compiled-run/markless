import {
	MARKLESS_PENDING_SETTLE_DEADLINE_MS,
	MARKLESS_REVEAL_TRAIN_CADENCE_MS,
} from '../pending-timing.ts';

// One shared polite status region outside the app: a live region inside an aria-busy element can go silent (NVDA + Firefox).
type Host = { closest?: (selector: string) => unknown; ownerDocument?: Document | null };

export const REFRESH_ANNOUNCEMENT = {
	busy: 'Updating…',
	settled: 'Updated',
	failed: 'Update failed',
} as const;

// An author who put the block inside their own live region (or aria-live="off") owns its announcements.
const AUTHOR_OWNED = '[aria-live],[role="status"],[role="alert"],[role="log"]';

// Each busy block's anchor: a block whose anchor has left the page no longer counts as busy, however often its content re-rendered.
const busy = new Map<object, { readonly isConnected?: boolean } | undefined>();
const forgetGone = () => {
	for (const [key, alive] of busy) if (alive?.isConnected === false) busy.delete(key);
};
let failed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let region: HTMLElement | undefined;

function regionIn(document: Document): HTMLElement {
	if (region?.isConnected) return region;
	region = document.createElement('div');
	region.setAttribute('role', 'status');
	region.setAttribute('aria-live', 'polite');
	region.setAttribute('aria-atomic', 'true');
	region.setAttribute('data-markless-announcer', '');
	Object.assign(region.style, {
		position: 'absolute',
		width: '1px',
		height: '1px',
		margin: '-1px',
		padding: '0',
		overflow: 'hidden',
		clip: 'rect(0 0 0 0)',
		clipPath: 'inset(50%)',
		whiteSpace: 'nowrap',
		border: '0',
	});
	document.body.append(region);
	return region;
}

function say(text: string, after: number): void {
	clearTimeout(timer);
	timer = setTimeout(() => {
		if (region) region.textContent = text;
	}, after);
}

export function refreshChanged(
	key: object,
	nowBusy: boolean,
	closing: 'failed' | 'silent' | undefined,
	hosts: Iterable<object>,
	alive?: { readonly isConnected?: boolean },
): void {
	if (closing === 'silent') {
		if (!busy.delete(key)) return;
		forgetGone();
		// The page went elsewhere: the busy line not yet said is dropped, and nothing follows it.
		if (busy.size === 0) clearTimeout(timer);
		return;
	}
	failed ||= closing === 'failed';
	if (nowBusy) {
		const shown = [...hosts] as Host[];
		const document = shown[0]?.ownerDocument;
		if (!document?.body || shown.some((host) => host.closest?.(AUTHOR_OWNED))) return;
		forgetGone();
		const wasQuiet = busy.size === 0;
		busy.set(key, alive);
		if (!wasQuiet) return;
		const live = regionIn(document);
		// A burst that starts again before the settled line is read keeps the Updating line already said.
		if (live.textContent === REFRESH_ANNOUNCEMENT.busy) return clearTimeout(timer);
		live.textContent = '';
		return say(REFRESH_ANNOUNCEMENT.busy, MARKLESS_PENDING_SETTLE_DEADLINE_MS);
	}
	if (!busy.delete(key)) return;
	forgetGone();
	if (busy.size > 0) return;
	const text = failed ? REFRESH_ANNOUNCEMENT.failed : REFRESH_ANNOUNCEMENT.settled;
	failed = false;
	say(text, MARKLESS_REVEAL_TRAIN_CADENCE_MS);
}

export function announceQuietFailure(hosts: Iterable<object>): void {
	const shown = [...hosts] as Host[];
	const document = shown[0]?.ownerDocument;
	if (!document?.body || shown.some((host) => host.closest?.(AUTHOR_OWNED))) return;
	regionIn(document).textContent = '';
	say(REFRESH_ANNOUNCEMENT.failed, MARKLESS_REVEAL_TRAIN_CADENCE_MS);
}

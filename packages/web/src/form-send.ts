import type { ProtocolSubmitEventFacts } from '@markless/serializer/protocol';
import { submitRecord } from './event-current-target.ts';
import { IN_PLACE_LOCATION_HEADER, IN_PLACE_REQUEST_HEADER } from './fns/in-place-headers.ts';
import type { KeptSubmission } from './inline/sync-policy-core.ts';
import { holdSubmit } from './submit-hold.ts';

// Loaded on the first submit sent in place. A field named like a form property shadows it, so the form is read through its prototype.

// The browser sends each line break in a field as CRLF.
const crlf = (value: string) => value.replace(/\r\n|\r|\n/g, '\r\n');

// The body the browser would send for this enctype, so the route reads the same request with JavaScript on or off.
function body(form: HTMLFormElement, by: HTMLElement | null, enctype: string): FormData | string {
	const data = new FormData(form, by);
	if (enctype === 'multipart/form-data') return data;
	const pairs = [...data].map(([name, value]) => [
		crlf(name),
		crlf(typeof value === 'string' ? value : value.name),
	]);
	if (enctype === 'text/plain')
		return pairs.map(([name, value]) => `${name}=${value}\r\n`).join('');
	return new URLSearchParams(pairs).toString();
}

// A failed answer's own words: a JSON body's message, or a plain-text body; anything else, its status line.
async function failure(response: Response): Promise<Error> {
	const type = response.headers.get('content-type') ?? '';
	const said: unknown = await (
		type.includes('json')
			? response.json().then((json: { message?: unknown } | null) => json?.message)
			: type.startsWith('text/plain')
				? response.text()
				: Promise.resolve(undefined)
	).catch(() => undefined);
	return new Error(
		typeof said === 'string' && said ? said : response.statusText || `HTTP ${response.status}`,
	);
}

const pageKey = (url: URL) => url.pathname + url.search;

// A click on a link to the page: the router, when the app has one, swaps it in place; otherwise the browser loads it.
function follow(url: URL): void {
	const link = document.createElement('a');
	link.href = url.href;
	link.hidden = true;
	document.body.append(link);
	try {
		link.click();
	} finally {
		link.remove();
	}
}

/**
 * Sends a submission the browser would have sent as a same-origin POST, from inside its dispatch so the save refreshes
 * what is shown, and rejects with the route's message. `held` hears the hold's end once the submission is held, as a
 * running handler's is. On success it does what the browser's answer would have shown: a redirect to another page of
 * this site is followed in place, one to another site loads it, and otherwise the form shows fresh unless its fields
 * are bound to state. The app's api/ wrapper answers a marked request's redirect without the browser following it.
 */
export async function sendInPlace(
	event: SubmitEvent,
	kept: KeptSubmission,
	record: ProtocolSubmitEventFacts,
	held: (end: () => void) => void,
): Promise<void> {
	const form = event.target as HTMLFormElement;
	const by = event.submitter;
	held(
		holdSubmit(
			form,
			by,
			submitRecord(form),
			record.authoredSubmitAriaDisabled,
		),
	);
	const relList = Object.getOwnPropertyDescriptor(
		HTMLFormElement.prototype,
		'relList',
	)!.get!.call(form) as DOMTokenList;
	const response = await fetch(kept.action, {
		method: 'POST',
		body: body(form, by, kept.enctype),
		headers: {
			[IN_PLACE_REQUEST_HEADER]: '1',
			// FormData sets its own multipart type and boundary; a string body says what it is.
			...(kept.enctype !== 'multipart/form-data' && {
				'content-type':
					kept.enctype === 'text/plain'
						? 'text/plain'
						: 'application/x-www-form-urlencoded',
			}),
		},
		...(relList.contains('noreferrer') && { referrerPolicy: 'no-referrer' as const }),
	});
	if (!response.ok) throw await failure(response);
	void response.body?.cancel().catch(() => {});
	const pointed = response.headers.get(IN_PLACE_LOCATION_HEADER);
	// A route the wrapper does not answer lets fetch follow its redirect, as before.
	const landed =
		pointed !== null
			? new URL(pointed, response.url || kept.action)
			: response.redirected
				? new URL(response.url)
				: undefined;
	// Only a web address is followed: a javascript: or data: location would run on this page, which a native submit never does.
	if (landed && landed.protocol !== 'http:' && landed.protocol !== 'https:')
		throw new Error('The save answered with a redirect that is not a web address.');
	if (landed && landed.origin !== location.origin) return location.assign(landed.href);
	if (landed && pageKey(landed) !== pageKey(new URL(location.href))) return follow(landed);
	if (record.inPlaceSubmit === 'reset') HTMLFormElement.prototype.reset.call(form);
}

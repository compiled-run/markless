import type { ProtocolSubmitEventFacts } from '@markless/serializer/protocol';
import { holdBusy, submitRecord } from './event-current-target.ts';

// Loaded on the first submit whose handler returns a promise or that is sent in place: the form is busy, and its submitter marked, until that submission is done.
type Run = { readonly sent: string; readonly submitter: HTMLElement | null; readonly marks: boolean };

const running = new WeakMap<HTMLFormElement, ReadonlyArray<Run>>();

// A submission identical to one still running is cancelled before any handler hears it; a changed one runs.
function guard(event: Event): void {
	const form = event.target as HTMLFormElement;
	const runs = running.get(form);
	if (!runs) return;
	const submitter = (event as SubmitEvent).submitter;
	const sent = submitRecord(form);
	if (runs.some((run) => run.sent === sent && run.submitter === submitter)) {
		event.preventDefault();
		event.stopImmediatePropagation();
	}
}

/** Holds a form for one submission: `sent` is what it carried, read before its handler ran; the call it returns ends the hold. */
export function holdSubmit(
	form: HTMLFormElement,
	submitter: HTMLElement | null,
	sent: string,
	authoredAriaDisabled?: true,
): () => void {
	addEventListener('submit', guard, true);
	// A form whose submit control has an author-written aria-disabled leaves aria-disabled to the author on every control.
	const run: Run = { sent, submitter, marks: !!submitter && !authoredAriaDisabled };
	running.set(form, [...(running.get(form) ?? []), run]);
	holdBusy(form, run, true);
	if (run.marks) submitter!.setAttribute('aria-disabled', 'true');
	return () => {
		const left = (running.get(form) ?? []).filter((other) => other !== run);
		if (left.length > 0) running.set(form, left);
		else running.delete(form);
		holdBusy(form, run, false);
		if (run.marks && !left.some((other) => other.marks && other.submitter === submitter))
			submitter!.removeAttribute('aria-disabled');
	};
}

type Submitter = HTMLButtonElement | HTMLInputElement;

// A field the submitter overrides with its form* attribute, as the browser reads it.
function chosen<K extends 'action' | 'enctype'>(
	form: HTMLFormElement,
	by: Submitter | null,
	name: K,
): string {
	return by?.hasAttribute('form' + name)
		? name === 'action'
			? by.formAction
			: by.formEnctype
		: form[name];
}

// The body the browser would send for this enctype, so the route reads the same request with JavaScript on or off.
function body(form: HTMLFormElement, by: Submitter | null): FormData | URLSearchParams | string {
	const data = new FormData(form, by);
	const enctype = chosen(form, by, 'enctype');
	if (enctype === 'multipart/form-data') return data;
	const pairs = [...data].map(
		([name, value]) => [name, typeof value === 'string' ? value : value.name] as const,
	);
	if (enctype === 'text/plain')
		return pairs.map(([name, value]) => `${name}=${value}\r\n`).join('');
	return new URLSearchParams(pairs as Array<[string, string]>);
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

/**
 * Sends a submission the browser would have sent as a same-origin POST, from inside its dispatch so the save refreshes
 * what is shown, and rejects with the route's message. It is asked again first, since another listener may have
 * cancelled the submit. `held` hears the hold's end once the submission is held, as a running handler's is.
 * On success it does what the browser's answer would have shown: a redirect to another page is followed in place,
 * otherwise the form shows fresh unless its fields are bound to state.
 */
export async function sendInPlace(
	event: SubmitEvent,
	record: ProtocolSubmitEventFacts,
	held: (end: () => void) => void,
): Promise<void> {
	const form = event.target as HTMLFormElement;
	const by = event.submitter as Submitter | null;
	if (!(await import('./inline/sync-policy-core-lazy.ts')).submitsInPlace(event, true)) return;
	held(holdSubmit(form, by, submitRecord(form), record.authoredSubmitAriaDisabled));
	const action = chosen(form, by, 'action');
	const response = await fetch(action, {
		method: 'POST',
		body: body(form, by),
		...(chosen(form, by, 'enctype') === 'text/plain' && { headers: { 'content-type': 'text/plain' } }),
		...(form.relList.contains('noreferrer') && { referrerPolicy: 'no-referrer' as const }),
	});
	if (!response.ok) throw await failure(response);
	// The page a redirect landed on was rendered for a full load; only its address is used.
	void response.body?.cancel().catch(() => {});
	const landed = new URL(response.url || action);
	if (response.redirected && pageKey(landed) !== pageKey(new URL(location.href))) return follow(landed);
	if (record.inPlaceSubmit === 'reset') form.reset();
}

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

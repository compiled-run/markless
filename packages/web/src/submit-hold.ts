import { holdBusy, submitRecord } from './event-current-target.ts';

// Loaded only for a submit whose handler returns a promise: the form is busy, and its submitter marked, until that submission is done.
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

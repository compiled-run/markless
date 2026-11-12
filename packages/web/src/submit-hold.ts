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

/** Holds a form for one submission: `sent` is what it carried, read before its handler ran; marks wait for `painted`; the call it returns ends the hold. */
export function holdSubmit(
	form: HTMLFormElement,
	submitter: HTMLElement | null,
	sent: string,
	authoredAriaDisabled?: true,
	painted?: Promise<void>,
): () => void {
	addEventListener('submit', guard, true);
	// A form whose submit control has an author-written aria-disabled leaves aria-disabled to the author on every control.
	const run: Run = { sent, submitter, marks: !!submitter && !authoredAriaDisabled };
	running.set(form, [...(running.get(form) ?? []), run]);
	const mark = (on: boolean) => {
		holdBusy(form, run, on);
		if (!run.marks) return;
		if (on) submitter!.setAttribute('aria-disabled', 'true');
		else if (!running.get(form)?.some((other) => other.marks && other.submitter === submitter))
			submitter!.removeAttribute('aria-disabled');
	};
	const marked = Promise.resolve(painted).then(
		() => mark(true),
		() => mark(true),
	);
	return () => {
		const left = (running.get(form) ?? []).filter((other) => other !== run);
		if (left.length > 0) running.set(form, left);
		else running.delete(form);
		void marked.then(() => mark(false));
	};
}

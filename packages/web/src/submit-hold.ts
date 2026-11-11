// Loaded only for a submit whose handler returns a promise: the form is busy and its submitter marked until that promise settles.
type Run = { readonly sent: string; readonly submitter: HTMLElement | null };

const running = new WeakMap<HTMLFormElement, ReadonlyArray<Run>>();
const marked = new WeakSet<Element>();
let guarding = false;

// What a submission carries: every control's value and the button that sent it, so a repeat is told from a changed one.
function sentData(form: HTMLFormElement, submitter: HTMLElement | null): string {
	const controls = Array.from(form.elements) as Array<HTMLInputElement & HTMLSelectElement>;
	return JSON.stringify([
		controls.indexOf(submitter as never),
		controls.map((control) => [
			control.selectedOptions
				? Array.from(control.selectedOptions, (option) => option.value)
				: control.value,
			control.checked,
		]),
	]);
}

// A submission identical to one still running is cancelled before any handler hears it; a changed one runs.
function guard(event: Event): void {
	const form = event.target as HTMLFormElement;
	const runs = running.get(form);
	if (!runs) return;
	const sent = sentData(form, (event as SubmitEvent).submitter);
	if (runs.some((run) => run.sent === sent)) {
		event.preventDefault();
		event.stopImmediatePropagation();
	}
}

/** Marks a form busy and its submitter aria-disabled; the call it returns ends this run's share of both. */
export function holdSubmit(form: HTMLFormElement, submitter: HTMLElement | null): () => void {
	if (!guarding) {
		guarding = true;
		addEventListener('submit', guard, true);
	}
	const run: Run = { sent: sentData(form, submitter), submitter };
	running.set(form, [...(running.get(form) ?? []), run]);
	form.setAttribute('aria-busy', 'true');
	// An aria-disabled the page set itself is left alone.
	if (submitter && (marked.has(submitter) || !submitter.hasAttribute('aria-disabled'))) {
		marked.add(submitter);
		submitter.setAttribute('aria-disabled', 'true');
	}
	return () => {
		const left = (running.get(form) ?? []).filter((other) => other !== run);
		if (submitter && marked.has(submitter) && !left.some((other) => other.submitter === submitter)) {
			marked.delete(submitter);
			submitter.removeAttribute('aria-disabled');
		}
		if (left.length > 0) return void running.set(form, left);
		running.delete(form);
		form.removeAttribute('aria-busy');
	};
}

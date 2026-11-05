// The problem list under a block's result: one entry per message, each line a button that reveals it.
import type { CodeDiagnostic } from './protocol.ts';

/** One entry per distinct message, carrying every place it was reported. */
export function groupProblems(
	problems: readonly CodeDiagnostic[],
): Array<{ readonly first: CodeDiagnostic; readonly places: readonly CodeDiagnostic[] }> {
	const groups = new Map<string, CodeDiagnostic[]>();
	for (const problem of problems) {
		const key = `${problem.file}\n${problem.message}`;
		groups.set(key, [...(groups.get(key) ?? []), problem]);
	}
	return [...groups.values()].map((places) => ({ first: places[0]!, places }));
}

/** The Markless error code a problem message starts with, if any. */
export function errorCodeOf(message: string): string | undefined {
	return /^MARKLESS_[A-Z0-9_]+/.exec(message)?.[0];
}

export function problemItem(
	group: ReturnType<typeof groupProblems>[number],
	reveal: (problem: CodeDiagnostic) => void,
): HTMLLIElement {
	const item = document.createElement('li');
	const head = document.createElement('p');
	head.className = 'code-problem-head';
	const located = group.places.filter((place) => place.line > 0);
	if (located.length === 0)
		head.append(group.first.file ? `${group.first.file}: ` : 'While running: ');
	else {
		head.append(`${group.first.file}, line${located.length > 1 ? 's' : ''} `);
		located.forEach((place, index) => {
			if (index > 0) head.append(', ');
			const jump = document.createElement('button');
			jump.type = 'button';
			jump.className = 'code-problem-where';
			jump.textContent = String(place.line);
			jump.setAttribute('aria-label', `Go to ${place.file} line ${place.line}`);
			jump.addEventListener('click', () => reveal(place));
			head.append(jump);
		});
		head.append(': ');
	}
	const message = document.createElement('span');
	message.className = 'code-problem-message';
	const code = errorCodeOf(group.first.message);
	if (code) {
		const link = document.createElement('a');
		link.className = 'code-problem-code';
		link.href = `/errors/${code}`;
		link.textContent = code;
		message.append(link, group.first.message.slice(code.length));
	} else message.textContent = group.first.message;
	head.append(message);
	item.append(head);
	if (group.first.detail) {
		const more = document.createElement('details');
		more.className = 'code-problem-detail';
		const summary = document.createElement('summary');
		summary.textContent = 'Why, and how to fix it';
		more.append(summary, group.first.detail);
		item.append(more);
	}
	return item;
}

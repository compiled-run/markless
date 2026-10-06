// The live half of a <Code> block, loaded on the reader's first point, focus or edit:
// editors replace the first-paint code, and the result frame starts compiling. The
// prerendered starter stays in the Result pane until the first edit or Reset.
import { asset } from '../../../site-base.ts';
import type { CodeEditor } from './editor.ts';
import type { CodeDiagnostic, CodeFile, FrameReply, FrameRequest } from './protocol.ts';

export type CodeSession = { reset(): void };

const EDIT_DELAY_MS = 300;
// Compiles the starter as soon as the frame is up, so the first edit finds the compiler loaded.
const WARM_UP = 0;
const sessions = new WeakMap<HTMLElement, Promise<CodeSession>>();

/** The session of `box`, started on the first call. */
export function codeSession(box: HTMLElement, starters: readonly CodeFile[]): Promise<CodeSession> {
	let session = sessions.get(box);
	if (!session) sessions.set(box, (session = start(box, starters)));
	return session;
}

function part<T extends HTMLElement>(box: HTMLElement, name: string): T {
	const found = box.querySelector<T>(`[data-code-${name}]`);
	if (!found) throw new Error(`The Code block has no [data-code-${name}] element.`);
	return found;
}

function siteLook(): FrameRequest {
	return {
		type: 'code:look',
		dark: document.documentElement.classList.contains('dark'),
		stylesheets: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
			(link) => link.href,
		),
	};
}

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

function problemItem(
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
	message.textContent = group.first.message;
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

async function start(box: HTMLElement, starters: readonly CodeFile[]): Promise<CodeSession> {
	const stage = part(box, 'stage');
	const result = part(box, 'result');
	const status = part(box, 'status');
	const problemsList = part(box, 'problems');
	const marker = box.querySelector('[data-code-marker] .marker-sweep');
	box.dataset.code = 'loading';

	const frame = document.createElement('iframe');
	frame.className = 'code-frame';
	frame.title = 'Result of the code';
	frame.hidden = true;
	frame.src = asset(`_code-frame.html`);
	result.append(frame);

	let ready = false;
	let nextId = 1;
	let latest = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let edited = false;
	const send = (message: FrameRequest) =>
		frame.contentWindow?.postMessage(message, location.origin);

	const { createEditor } = await import('./editor.ts');
	const editors = new Map<string, CodeEditor>();
	for (const host of box.querySelectorAll<HTMLElement>('[data-code-file]')) {
		const name = host.dataset.codeFile ?? '';
		const starter = starters.find((file) => file.name === name);
		if (!starter) continue;
		editors.set(
			name,
			createEditor(host, {
				file: name,
				code: starter.code,
				onChange() {
					edited = true;
					clearTimeout(timer);
					timer = setTimeout(run, EDIT_DELAY_MS);
				},
			}),
		);
		host.querySelector('pre')?.remove();
	}
	box.dataset.code = 'ready';

	function files(): CodeFile[] {
		return starters.map((file) => ({
			name: file.name,
			code: editors.get(file.name)?.text() ?? file.code,
		}));
	}

	function run(): void {
		if (!ready) return;
		latest = nextId++;
		box.dataset.code = 'running';
		status.textContent = 'Compiling…';
		send({ type: 'code:run', id: latest, files: files() });
	}

	function reveal(problem: CodeDiagnostic): void {
		box.querySelector<HTMLElement>(`[data-code-tab="${CSS.escape(problem.file)}"]`)?.click();
		editors.get(problem.file)?.reveal(problem.line, problem.column);
	}

	function showProblems(problems: readonly CodeDiagnostic[]): void {
		for (const [name, editor] of editors)
			editor.showProblems(problems.filter((problem) => problem.file === name));
		problemsList.replaceChildren(
			...groupProblems(problems).map((group) => problemItem(group, reveal)),
		);
		problemsList.hidden = problems.length === 0;
	}

	function onResult(message: Extract<FrameReply, { type: 'code:result' }>): void {
		if (message.id === WARM_UP || message.id !== latest) return;
		if (!message.ok) {
			// An empty list is a compile the worker skipped because a newer edit arrived.
			if (message.diagnostics.length === 0) return;
			box.dataset.code = 'error';
			status.textContent = 'Not built';
			showProblems(message.diagnostics);
			return;
		}
		box.dataset.code = 'ready';
		status.textContent = '';
		showProblems([]);
		stage.hidden = true;
		frame.hidden = false;
		const beat = marker?.getAttribute('data-beat');
		marker?.setAttribute('data-beat', beat === 'odd' ? 'even' : 'odd');
	}

	window.addEventListener('message', (event: MessageEvent<FrameReply>) => {
		if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
		const message = event.data;
		if (message.type === 'code:ready') {
			ready = true;
			send(siteLook());
			if (edited) run();
			else send({ type: 'code:run', id: WARM_UP, files: starters });
		} else if (message.type === 'code:height') frame.style.height = `${message.height}px`;
		else if (message.type === 'code:result') onResult(message);
	});

	new MutationObserver(() => {
		if (ready) send(siteLook());
	}).observe(document.documentElement, { attributeFilter: ['class'] });

	return {
		reset() {
			for (const starter of starters) editors.get(starter.name)?.replace(starter.code);
			clearTimeout(timer);
			edited = true;
			showProblems([]);
			run();
		},
	};
}

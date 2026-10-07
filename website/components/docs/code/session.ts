// The live half of a <Code> block; the prerendered starter stays in the Result pane until the first run.
import { asset } from '../../../site-base.ts';
import type { CodeEditor } from './editor.ts';
import { groupProblems, problemItem } from './problems.ts';
import type { CodeDiagnostic, CodeFile, FrameReply, FrameRequest } from './protocol.ts';

export type CodeSession = { reset(): void; dispose(): void };

const EDIT_DELAY_MS = 300;
// Compiles the starter as soon as the frame is up, so the first edit finds the compiler loaded.
const WARM_UP = 0;
const sessions = new WeakMap<HTMLElement, Promise<CodeSession>>();

/** The one way a block starts: every trigger calls this with the block's `<figure>`. */
export function bootCodeBlock(
	box: HTMLElement,
	starters: readonly CodeFile[],
): Promise<CodeSession> {
	let session = sessions.get(box);
	if (!session) sessions.set(box, (session = start(box, starters)));
	return session;
}

/** Where a block keeps the reader's edits: per page, per block, per starter text. */
function storageKey(box: HTMLElement, starters: readonly CodeFile[]): string {
	const index = [...document.querySelectorAll('.code-block')].indexOf(box);
	let hash = 0;
	for (const char of starters.map((file) => file.name + file.code).join('\0'))
		hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0;
	return `markless-code:${location.pathname}:${index}:${(hash >>> 0).toString(36)}`;
}

function readSaved(key: string): Record<string, string> | undefined {
	try {
		const saved = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown;
		return saved && typeof saved === 'object' ? (saved as Record<string, string>) : undefined;
	} catch {
		return undefined;
	}
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

async function start(box: HTMLElement, starters: readonly CodeFile[]): Promise<CodeSession> {
	const stage = part(box, 'stage');
	const status = part(box, 'status');
	const problemsList = part(box, 'problems');
	const listening = new AbortController();
	const { signal } = listening;
	box.dataset.code = 'loading';

	const frame = document.createElement('iframe');
	frame.className = 'code-frame';
	frame.title = 'Result of the code';
	frame.hidden = true;
	frame.src = asset(`_code-frame.html`);

	let ready = false;
	let nextId = 1;
	let latest = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let edited = false;
	const send = (message: FrameRequest) =>
		frame.contentWindow?.postMessage(message, location.origin);
	const editors = new Map<string, CodeEditor>();

	const actions: Record<string, () => void> = {
		reset,
		lines() {
			box.dataset.lines = box.dataset.lines === 'off' ? 'on' : 'off';
			syncTools();
		},
		edit() {
			const input = box.querySelector<HTMLTextAreaElement>('.pane:not([hidden]) [data-code-input]');
			input?.focus();
			input?.setSelectionRange(input.value.length, input.value.length);
		},
		fullscreen() {
			if (document.fullscreenElement === box) void document.exitFullscreen();
			else if (box.hasAttribute('data-expanded')) box.removeAttribute('data-expanded');
			else if (document.fullscreenEnabled && box.requestFullscreen)
				box.requestFullscreen().catch(() => box.setAttribute('data-expanded', ''));
			// iPhone Safari has no element full screen; the block covers the viewport in place instead.
			else box.setAttribute('data-expanded', '');
			syncTools();
		},
	};

	function syncTools(): void {
		const full = document.fullscreenElement === box || box.hasAttribute('data-expanded');
		box.toggleAttribute('data-full', full);
		for (const button of box.querySelectorAll<HTMLElement>('[data-code-action]')) {
			const action = button.dataset.codeAction;
			if (action === 'lines') button.setAttribute('aria-pressed', String(box.dataset.lines !== 'off'));
			if (action === 'fullscreen') button.setAttribute('aria-pressed', String(full));
		}
	}

	// Wired before anything loads, so a press that started the session still lands.
	for (const button of box.querySelectorAll<HTMLElement>('[data-code-action]'))
		button.addEventListener('click', () => actions[button.dataset.codeAction ?? '']?.(), {
			signal,
		});
	document.addEventListener('fullscreenchange', syncTools, { signal });
	document.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'Escape' && box.hasAttribute('data-expanded')) actions.fullscreen!();
		},
		{ signal },
	);

	// Listening before the frame loads: it says it is ready once, possibly before the editor arrives.
	window.addEventListener(
		'message',
		(event: MessageEvent<FrameReply>) => {
			if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
			const message = event.data;
			if (message.type === 'code:ready') {
				ready = true;
				send(siteLook());
				if (edited) run();
				else send({ type: 'code:run', id: WARM_UP, files: starters });
			} else if (message.type === 'code:height') frame.style.height = `${message.height}px`;
			else if (message.type === 'code:result') onResult(message);
		},
		{ signal },
	);
	stage.after(frame);

	const [{ createEditor }, highlighter] = await Promise.all([
		import('./editor.ts'),
		import('./highlight.ts').then((code) => code.loadHighlighter()),
	]);
	for (const host of box.querySelectorAll<HTMLElement>('[data-code-file]')) {
		const name = host.dataset.codeFile ?? '';
		if (!starters.some((file) => file.name === name)) continue;
		editors.set(
			name,
			createEditor(host, {
				file: name,
				highlighter,
				onChange() {
					edited = true;
					clearTimeout(timer);
					timer = setTimeout(run, EDIT_DELAY_MS);
				},
			}),
		);
	}
	const key = storageKey(box, starters);
	const saved = readSaved(key);
	if (saved) {
		for (const starter of starters) {
			const code = saved[starter.name];
			if (typeof code === 'string') editors.get(starter.name)?.load(code);
		}
		edited = true;
		box.toggleAttribute('data-restored', true);
		if (ready) run();
	}
	box.dataset.code = 'ready';

	function save(current: readonly CodeFile[]): void {
		const changed = current.some(
			(file, index) => file.code.replace(/\n$/, '') !== starters[index]!.code.replace(/\n$/, ''),
		);
		try {
			if (changed)
				localStorage.setItem(key, JSON.stringify(Object.fromEntries(current.map((file) => [file.name, file.code]))));
			else localStorage.removeItem(key);
		} catch {}
		box.toggleAttribute('data-restored', changed && box.hasAttribute('data-restored'));
	}

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
		const current = files();
		save(current);
		send({ type: 'code:run', id: latest, files: current });
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
	}

	function reset(): void {
		const pressed = document.activeElement as HTMLElement | null;
		for (const starter of starters) editors.get(starter.name)?.replace(starter.code);
		box.removeAttribute('data-restored');
		pressed?.focus({ preventScroll: true });
		clearTimeout(timer);
		edited = true;
		showProblems([]);
		run();
	}

	const look = new MutationObserver(() => {
		if (ready) send(siteLook());
	});
	look.observe(document.documentElement, { attributeFilter: ['class'] });

	return {
		reset,
		dispose() {
			listening.abort();
			look.disconnect();
			clearTimeout(timer);
			for (const editor of editors.values()) editor.dispose();
			frame.remove();
			sessions.delete(box);
		},
	};
}

// The live half of a <Code> block; the prerendered starter stays in the Result pane until the first run.
import { asset } from '../../../site-base.ts';
import type { CodeEditor } from './editor.ts';
import { groupProblems, problemItem } from './problems.ts';
import type {
	CodeDiagnostic,
	CodeFile,
	CompileOutcome,
	FrameReply,
	FrameRequest,
	WorkerReply,
	WorkerRequest,
} from './protocol.ts';

export type CodeSession = { reset(): void; dispose(): void };

/**
 * How long the reader must stop typing before a build error shows. Longer than the gap between
 * most keystrokes, so half-typed code does not flash errors, and short enough to read as a pause.
 */
export const ERROR_PAUSE_MS = 450;
const sessions = new WeakMap<HTMLElement, Promise<CodeSession>>();
// code.tsrx reads this key: a reader who has edited once gets later blocks booted on sight.
const EDITOR_FLAG = 'markless-code:editor';
let flagged = false;
let compiler: Worker | undefined;
const compiles = new Map<number, (outcome: CompileOutcome) => void>();
let nextId = 1;
let blockCount = 0;

/** The page's one compile worker, shared by every block on it. */
function startCompiler(): Worker {
	if (compiler) return compiler;
	compiler = new Worker(new URL('./compile-worker.ts', import.meta.url), { type: 'module' });
	compiler.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
		compiles.get(event.data.id)?.(event.data.outcome);
		compiles.delete(event.data.id);
	});
	return compiler;
}

function compile(request: WorkerRequest): Promise<CompileOutcome> {
	const worker = startCompiler();
	return new Promise((resolve) => {
		compiles.set(request.id, resolve);
		worker.postMessage(request);
	});
}

function markEditor(): void {
	if (flagged) return;
	flagged = true;
	try {
		localStorage.setItem(EDITOR_FLAG, '1');
	} catch {}
}

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

let fluidNames: readonly string[] | undefined;

/** The page's `:root`/`html` custom properties whose declared value uses `vw`. */
function fluidTokens(): readonly string[] {
	if (fluidNames) return fluidNames;
	const names = new Set<string>();
	const visit = (rules: CSSRuleList) => {
		for (const rule of rules) {
			if (rule instanceof CSSStyleRule && /^(:root|html)$/.test(rule.selectorText.trim())) {
				for (const name of rule.style)
					if (name.startsWith('--') && /vw\b/.test(rule.style.getPropertyValue(name)))
						names.add(name);
			}
			if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
		}
	};
	for (const sheet of document.styleSheets) {
		try {
			visit(sheet.cssRules);
		} catch {}
	}
	if (names.size > 0) fluidNames = [...names];
	return [...names];
}

// vw inside the frame is the frame's width, so the page sends each fluid token already resolved.
function resolvedTokens(): Record<string, string> {
	const probe = document.createElement('div');
	probe.style.display = 'none';
	document.body.append(probe);
	const values: Record<string, string> = {};
	for (const name of fluidTokens()) {
		probe.style.width = `var(${name})`;
		const width = getComputedStyle(probe).width;
		if (width.endsWith('px')) values[name] = width;
	}
	probe.remove();
	return values;
}

function siteLook(): FrameRequest {
	return {
		type: 'code:look',
		dark: document.documentElement.classList.contains('dark'),
		stylesheets: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
			(link) => link.href,
		),
		tokens: resolvedTokens(),
	};
}

async function start(box: HTMLElement, starters: readonly CodeFile[]): Promise<CodeSession> {
	const stage = part(box, 'stage');
	const status = part(box, 'status');
	const problemsList = part(box, 'problems');
	const listening = new AbortController();
	const { signal } = listening;
	box.dataset.code = 'loading';
	const block = `block-${blockCount++}`;
	startCompiler();

	const frame = document.createElement('iframe');
	frame.className = 'code-frame';
	frame.title = 'Result of the code';
	frame.hidden = true;
	frame.src = asset(`_code-frame.html`);

	let ready = false;
	// The newest compile sent, and the newest result sent to the frame.
	let latest = 0;
	let framed = 0;
	let warmUp = -1;
	let compiling = false;
	let queued = false;
	let lastInput = 0;
	let held: FrameRequest | undefined;
	let errorTimer: ReturnType<typeof setTimeout> | undefined;
	const send = (message: FrameRequest) =>
		frame.contentWindow?.postMessage(message, location.origin);
	const editors = new Map<string, CodeEditor>();

	const actions: Record<string, () => void> = {
		reset,
		refresh() {
			request();
		},
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
				if (held) send(held);
				held = undefined;
			} else if (message.type === 'code:height') frame.style.height = `${message.height}px`;
			else if (message.type === 'code:result') onResult(message);
		},
		{ signal },
	);
	stage.after(frame);

	const key = storageKey(box, starters);
	const typedAtStart = [...box.querySelectorAll('textarea')].some(
		(input) => input.value !== input.defaultValue,
	);
	// Compiling the starter while the reader looks pays the block's first compile and render early.
	if (!typedAtStart && !readSaved(key)) {
		warmUp = latest = nextId++;
		void compileAndShow(warmUp, starters);
	}

	const [{ createEditor }, highlighter] = await Promise.all([
		import('./editor.ts'),
		import('./highlight.ts').then((code) =>
			code.loadHighlighter(starters.map((file) => file.name)),
		),
	]);
	const typedEarly: HTMLTextAreaElement[] = [];
	for (const host of box.querySelectorAll<HTMLElement>('[data-code-file]')) {
		const name = host.dataset.codeFile ?? '';
		if (!starters.some((file) => file.name === name)) continue;
		const input = host.querySelector('textarea');
		if (input && input.value !== input.defaultValue) typedEarly.push(input);
		editors.set(
			name,
			createEditor(host, {
				file: name,
				highlighter,
				onChange() {
					markEditor();
					lastInput = performance.now();
					clearTimeout(errorTimer);
					request();
				},
			}),
		);
	}
	const saved = typedEarly.length > 0 ? undefined : readSaved(key);
	if (saved) {
		for (const starter of starters) {
			const code = saved[starter.name];
			if (typeof code === 'string') editors.get(starter.name)?.load(code);
		}
		box.toggleAttribute('data-restored', true);
		request();
	}
	for (const input of typedEarly) input.dispatchEvent(new Event('input', { bubbles: true }));
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

	// One compile in flight per block; text typed meanwhile goes in the next one, as it reads then.
	function request(): void {
		box.dataset.code = 'running';
		status.textContent = 'Compiling…';
		if (compiling) queued = true;
		else run();
	}

	function run(): void {
		latest = nextId++;
		compiling = true;
		const current = files();
		save(current);
		void compileAndShow(latest, current);
	}

	async function compileAndShow(id: number, current: readonly CodeFile[]): Promise<void> {
		const outcome = await compile({ id, block, files: current, warmUp: id === warmUp });
		if (id !== warmUp) {
			compiling = false;
			if (queued) {
				queued = false;
				run();
			}
		}
		if (id === warmUp ? id !== latest : id <= framed) return;
		if (!outcome.ok) {
			if (id === latest && id !== warmUp) fail(outcome.diagnostics);
			return;
		}
		framed = id;
		const modules: FrameRequest = {
			type: 'code:modules',
			id,
			entry: outcome.entry,
			modules: outcome.modules,
		};
		if (ready) send(modules);
		else held = modules;
	}

	function fail(problems: readonly CodeDiagnostic[]): void {
		clearTimeout(errorTimer);
		const wait = lastInput + ERROR_PAUSE_MS - performance.now();
		if (wait > 0) errorTimer = setTimeout(() => showFailure(problems), wait);
		else showFailure(problems);
	}

	function showFailure(problems: readonly CodeDiagnostic[]): void {
		box.dataset.code = 'error';
		status.textContent = 'Not built';
		showProblems(problems);
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
		if (message.id === warmUp || message.id !== framed) return;
		if (!message.ok) {
			if (message.id === latest) fail(message.diagnostics);
			return;
		}
		if (message.id === latest) {
			box.dataset.code = 'ready';
			status.textContent = '';
			showProblems([]);
		}
		stage.hidden = true;
		frame.hidden = false;
	}

	function reset(): void {
		const pressed = document.activeElement as HTMLElement | null;
		for (const starter of starters) editors.get(starter.name)?.replace(starter.code);
		box.removeAttribute('data-restored');
		pressed?.focus({ preventScroll: true });
		clearTimeout(errorTimer);
		showProblems([]);
		request();
	}

	const look = new MutationObserver(() => {
		if (ready) send(siteLook());
	});
	look.observe(document.documentElement, { attributeFilter: ['class'] });
	let resizing = 0;
	window.addEventListener(
		'resize',
		() => {
			if (!ready || resizing) return;
			resizing = requestAnimationFrame(() => {
				resizing = 0;
				send(siteLook());
			});
		},
		{ signal },
	);

	return {
		reset,
		dispose() {
			listening.abort();
			look.disconnect();
			cancelAnimationFrame(resizing);
			clearTimeout(errorTimer);
			for (const editor of editors.values()) editor.dispose();
			frame.remove();
			sessions.delete(box);
		},
	};
}

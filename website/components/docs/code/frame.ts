// The page a <Code> block's result runs in, at /_code-frame.html. The docs page posts
// the files; the compile worker turns them into modules; this page links them to
// Blob URLs and renders the entry's default export into its body.
import { render, type RenderTarget } from '@markless/core';
import { installRuntimeImport, runtimeImportCall, runtimeModuleUrl } from './frame-runtime.ts';
import { blockStyles, createLinker } from './link.ts';
import type {
	CodeDiagnostic,
	FrameReply,
	FrameRequest,
	WorkerReply,
	WorkerRequest,
} from './protocol.ts';

type Run = { load(specifier: string): Promise<unknown> };

const RUNS = '__marklessCodeRuns';
const runs = new Map<number, Run>();
(globalThis as Record<string, unknown>)[RUNS] = runs;

const stage = document.querySelector<HTMLElement>('[data-code-frame]') ?? document.body;
const worker = new Worker(new URL('./compile-worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<number, (reply: WorkerReply) => void>();
let latest = 0;
let urls: string[] = [];
let mountedRun = -1;

worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
	pending.get(event.data.id)?.(event.data);
	pending.delete(event.data.id);
});

function reply(message: FrameReply): void {
	parent.postMessage(message, location.origin);
}

function blobUrl(code: string): string {
	const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
	urls.push(url);
	return url;
}

// Runtime shims are shared by every run, so their URLs outlive the run that made them.
function runtimeUrl(code: string): string {
	return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}
installRuntimeImport(runtimeUrl);

function runtimeError(error: unknown): CodeDiagnostic {
	const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
	return { file: '', line: 0, column: 0, message };
}

function compile(id: number, request: WorkerRequest): Promise<WorkerReply> {
	return new Promise((resolve) => {
		pending.set(id, resolve);
		worker.postMessage(request);
	});
}

async function run(id: number, files: WorkerRequest['files']): Promise<void> {
	latest = id;
	const { outcome } = await compile(id, { id, files });
	if (id !== latest) return;
	if (!outcome.ok)
		return reply({ type: 'code:result', id, ok: false, diagnostics: outcome.diagnostics });
	const previousUrls = urls;
	urls = [];
	const linker = createLinker(outcome.modules, {
		url: blobUrl,
		runtime: (specifier) => runtimeModuleUrl(specifier, runtimeUrl),
		dynamicImport: (expression, specifier) =>
			runtimeImportCall(specifier) ?? `globalThis.${RUNS}.get(${id}).load(${expression})`,
	});
	runs.set(id, {
		load: async (specifier) => import(/* @vite-ignore */ await linker.url(specifier)),
	});
	const mount = document.createElement('div');
	try {
		const entry = (await import(/* @vite-ignore */ await linker.url(outcome.entry))) as {
			default?: unknown;
		};
		if (id !== latest) return;
		if (!entry.default)
			throw new Error(
				`${outcome.entry} has no default export, so there is no component to show.`,
			);
		// render() types its target for the resume DOM too, so a real element needs the cast.
		await render(entry.default as Parameters<typeof render>[0], {
			target: mount as unknown as RenderTarget,
		});
	} catch (error) {
		if (id === latest)
			reply({ type: 'code:result', id, ok: false, diagnostics: [runtimeError(error)] });
		return;
	}
	if (id !== latest) return;
	const style = document.createElement('style');
	style.textContent = blockStyles(outcome.modules);
	stage.replaceChildren(style, mount);
	for (const old of runs.keys()) if (old < id) runs.delete(old);
	for (const url of previousUrls) URL.revokeObjectURL(url);
	mountedRun = id;
	reply({ type: 'code:result', id, ok: true, diagnostics: [] });
}

function look(dark: boolean, stylesheets: readonly string[]): void {
	const root = document.documentElement;
	root.classList.toggle('dark', dark);
	root.classList.toggle('light', !dark);
	const have = new Set(
		[...document.querySelectorAll('link[rel="stylesheet"]')].map((link) =>
			link.getAttribute('href'),
		),
	);
	for (const href of stylesheets) {
		if (have.has(href)) continue;
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = href;
		document.head.append(link);
	}
}

window.addEventListener('message', (event: MessageEvent<FrameRequest>) => {
	if (event.origin !== location.origin || event.source !== parent) return;
	const message = event.data;
	if (message.type === 'code:run') void run(message.id, message.files);
	else if (message.type === 'code:look') look(message.dark, message.stylesheets);
});

// A handler that throws after the result is up is still the reader's code failing.
const reportUncaught = (error: unknown) =>
	reply({ type: 'code:result', id: mountedRun, ok: false, diagnostics: [runtimeError(error)] });
window.addEventListener('error', (event) => reportUncaught(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportUncaught(event.reason));

new ResizeObserver(() =>
	reply({
		type: 'code:height',
		height: Math.ceil(document.documentElement.getBoundingClientRect().height),
	}),
).observe(document.documentElement);

reply({ type: 'code:ready' });

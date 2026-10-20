// The page a <Code> block's result runs in, at /_code-frame.html. The docs page posts
// the compiled modules; this page links them to Blob URLs and renders the entry's
// default export into its body.
import { render, type RenderTarget } from '@markless/core';
import { installRuntimeImport, runtimeImportCall, runtimeModuleUrl } from './frame-runtime.ts';
import { blockStyles, createLinker } from './link.ts';
import type { CodeDiagnostic, CompiledModule, FrameReply, FrameRequest } from './protocol.ts';

type Run = { load(specifier: string): Promise<unknown> };

const RUNS = '__marklessCodeRuns';
const runs = new Map<number, Run>();
(globalThis as Record<string, unknown>)[RUNS] = runs;

const stage = document.querySelector<HTMLElement>('[data-code-frame]') ?? document.body;
let latest = 0;
let urls: string[] = [];
let mountedRun = -1;

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

async function run(
	id: number,
	entryId: string,
	modules: readonly CompiledModule[],
): Promise<void> {
	latest = id;
	const previousUrls = urls;
	urls = [];
	const linker = createLinker(modules, {
		url: blobUrl,
		runtime: (specifier) => runtimeModuleUrl(specifier, runtimeUrl),
		dynamicImport: (expression, specifier) =>
			runtimeImportCall(specifier) ?? `globalThis.${RUNS}.get(${id}).load(${expression})`,
	});
	runs.set(id, {
		// Vite 8.3 wraps import() in a non-async preload arrow, so its argument must not await.
		load: async (specifier) => {
			const moduleUrl = await linker.url(specifier);
			return import(/* @vite-ignore */ moduleUrl);
		},
	});
	const mount = document.createElement('div');
	try {
		const entryUrl = await linker.url(entryId);
		const entry = (await import(/* @vite-ignore */ entryUrl)) as {
			default?: unknown;
		};
		if (id !== latest) return;
		if (!entry.default)
			throw new Error(
				`${entryId} has no default export, so there is no component to show.`,
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
	style.textContent = blockStyles(modules);
	stage.replaceChildren(style, mount);
	for (const old of runs.keys()) if (old < id) runs.delete(old);
	for (const url of previousUrls) URL.revokeObjectURL(url);
	mountedRun = id;
	reply({ type: 'code:result', id, ok: true, diagnostics: [] });
}

function look(dark: boolean): void {
	document.documentElement.classList.toggle('dark', dark);
}

window.addEventListener('message', (event: MessageEvent<FrameRequest>) => {
	if (event.origin !== location.origin || event.source !== parent) return;
	const message = event.data;
	if (message.type === 'code:modules') void run(message.id, message.entry, message.modules);
	else if (message.type === 'code:look') look(message.dark);
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

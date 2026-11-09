import { expect, test } from 'vitest';
import { INLINE_DEFER_LOADER_SOURCE } from '../src/inline/defer.ts';
import { markRuntimeErrorReported } from '../src/runtime-error-reporting.ts';

type Loaded = { readonly resumeContainerEvent?: (input: unknown) => unknown; readonly settle?: () => string };

const NATIVE_IMPORT = 'import(/* @vite-ignore */ url)';

function loader(modules: Readonly<Record<string, Loaded>>) {
	expect(INLINE_DEFER_LOADER_SOURCE).toContain(NATIVE_IMPORT);
	return new Function('importModule', `return ${INLINE_DEFER_LOADER_SOURCE.replace(NATIVE_IMPORT, 'importModule(url)')}`)(
		async (url: string) => modules[url],
	) as (url: string) => Promise<Loaded>;
}

// The runtime already reported the handler's failure, so it must not surface again as an unhandled rejection.
test('the boot loader settles a dispatch whose failure the runtime already reported', async () => {
	const reported = new Error('save failed') as Error & Record<string, unknown>;
	markRuntimeErrorReported(reported);
	const load = loader({ '/resume.js': { resumeContainerEvent: () => Promise.reject(reported) } });
	await expect((await load('/resume.js')).resumeContainerEvent!({})).resolves.toBeUndefined();
});

test('the boot loader still rejects with a failure nothing reported', async () => {
	const unreported = new Error('module missing');
	const load = loader({
		'/resume.js': {
			resumeContainerEvent: async () => {
				throw unreported;
			},
		},
	});
	await expect((await load('/resume.js')).resumeContainerEvent!({})).rejects.toBe(unreported);
});

test('the boot loader keeps every other export of the module it loads', async () => {
	const load = loader({ '/settle.js': { settle: () => 'settled' } });
	expect((await load('/settle.js')).settle!()).toBe('settled');
});

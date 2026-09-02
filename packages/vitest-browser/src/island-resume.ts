import {
	resumeFromPayloadDocument,
	type ResumePayloadDocumentInput,
} from '@markless/core/web/resume';
// The router's own island symbol router, not a copy: it is what applies the
// instance-path scoping behind a `m<n>:` prefix. Reached by path because
// @markless/router is not a dependency of this test-only package, the same way
// the router's own mdx-route module reaches into web/ and serializer/.
import { loadMdxSymbol, type MdxSymbolLoader } from '../../router/src/vite/runtime/mdx-route.ts';

export type { MdxSymbolLoader };

type MarklessRosterResumeHost = {
	__marklessRosterResume?: () => Promise<typeof import('@markless/web/fns/roster-resume')>;
};

type MarklessOverlayHost = {
	__marklessOverlay?: (root: Element) => Promise<(() => void) | undefined> | undefined;
};

type IslandResumeInput = {
	readonly root: Element & { __asyncResumeRuntimeStarted?: boolean };
	readonly event: Event | 0;
	/** The record the inline resumer matched on its walk; null for its broad sweep. */
	readonly eventRecord?: unknown;
};

/**
 * The resume entry a multi-island test page loads, built from the same pieces
 * `emitComposedMdxRoute` writes into a composed MDX route: prefix-keyed symbol
 * loaders routed through `loadMdxSymbol`, one `resumeFromPayloadDocument` over
 * the merged payload, then the gesture that woke the page.
 */
export function createIslandResumeContainerEvent(
	loaders: ReadonlyArray<MdxSymbolLoader>,
): (input: IslandResumeInput) => Promise<void> {
	// The composed page's resume half never loads an island's own source module,
	// which is where the bundler installs this loader (emitRosterResumeLoaderInstall
	// in packages/bundler/src/source-module.ts, same specifier). Without it a card
	// that derives its place from a roster keeps its rendered one forever.
	(globalThis as MarklessRosterResumeHost).__marklessRosterResume ??= () =>
		import('@markless/web/fns/roster-resume');
	// loadMdxSymbol answers `unknown` because the router's own callers are the
	// plain JS it emits; the resume input wants the symbol shape it returns.
	const loadSymbol = ((symbolId: string) =>
		loadMdxSymbol(symbolId, [], loaders)) as ResumePayloadDocumentInput['loadSymbol'];
	return async function resumeContainerEvent(input) {
		// Matches emitComposedMdxRoute; per wake, not per evaluation, because the browser caches this module across mounts.
		(globalThis as MarklessOverlayHost).__marklessOverlay ??= (root) =>
			root.querySelector('[overlay]')
				? import('@markless/web/fns/overlay').then((m) => m.installOverlayBehavior(root))
				: undefined;
		input.root.__asyncResumeRuntimeStarted = true;
		const { runtime } = await resumeFromPayloadDocument({
			document: input.root as never,
			root: input.root as never,
			loadSymbol,
		});
		// `0` is the inline resumer's self-wake spelling; the runtime accepts it
		// the same way the router's emitted resume entry passes it through.
		// Record-less forwards are the inline resumer's broad sweep and pass through;
		// a forward that named a record and matches nothing is the refusal's case.
		await runtime.dispatch(input.event as never, {
			syncPolicyAlreadyApplied: true,
			ignoreUnmatched: input.eventRecord == null,
		});
	};
}

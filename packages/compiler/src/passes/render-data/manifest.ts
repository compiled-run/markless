// Pass `render-data-module`: the link-stage half of `render-data`. Once a
// module's render data has been emitted, this decides what that emitted module
// carries as a linkable unit — the content hash a consumer keys freshness on,
// the scoped-style virtual modules it links, and the claim manifest a data-only
// facade publishes. The emitted source, the style module ids and the set of
// modules the link actually carries all arrive as injected inputs: naming a
// virtual module and holding a build's registry stay with the bundler.
import type {
	CompilerDiagnostic,
	LinkedClaimManifest,
	RenderDataModuleArtifact,
} from '../../artifacts.ts';
import { linkedClaimManifestForSource } from '../link/claim-manifest.ts';

export const RENDER_DATA_MODULE_PASS_ID = 'render-data-module';

// FNV-1a over the emitted render-data module source, base36 under an `mrd1-`
// tag. The dev prerender feed compares these across rebuilds to decide whether
// an already-rendered page is stale, so the exact arithmetic here is the
// contract: change it and dev prerender parity drifts with nothing to show it.
export function renderDataContentHash(source: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `mrd1-${(hash >>> 0).toString(36)}`;
}

// Data-only facades keep demand records but own no symbol claims.
export function renderDataClaimManifest<Manifest extends LinkedClaimManifest>(
	manifest: Manifest,
	source: string,
): Manifest {
	return { ...linkedClaimManifestForSource(manifest, source), symbols: [] };
}

export function planRenderDataModule<Manifest extends LinkedClaimManifest>(input: {
	readonly source: string;
	readonly emittedModule: string;
	readonly moduleSource: string;
	readonly styleModules: ReadonlyArray<string>;
	readonly manifest: Manifest;
	// The modules the link actually carries. Omitted when the caller has not
	// linked yet — an absent set is "not asked", never "nothing linked".
	readonly linkedModules?: Iterable<string>;
}): RenderDataModuleArtifact<Manifest> {
	const linked = input.linkedModules ? new Set(input.linkedModules) : undefined;
	return {
		passId: RENDER_DATA_MODULE_PASS_ID,
		source: input.source,
		emittedModule: input.emittedModule,
		contentHash: renderDataContentHash(input.moduleSource),
		styleModules: [...input.styleModules],
		claimManifest: renderDataClaimManifest(input.manifest, input.emittedModule),
		diagnostics: linked
			? input.styleModules.flatMap((styleModule) =>
					linked.has(styleModule)
						? []
						: [unlinkedStyleDiagnostic(input.source, styleModule)],
				)
			: [],
	};
}

function unlinkedStyleDiagnostic(source: string, styleModule: string): CompilerDiagnostic {
	return {
		code: 'MARKLESS_RENDER_DATA_STYLE_UNLINKED',
		severity: 'error',
		phase: 'public-render',
		title: 'Render data links a scoped style module the link does not carry',
		message: `MARKLESS_RENDER_DATA_STYLE_UNLINKED: Render data for ${JSON.stringify(source)} links scoped style module ${JSON.stringify(styleModule)}, which this link does not carry.`,
		why: 'A scoped style that is compiled but never linked ships a component whose markup renders unstyled in the consuming app, with nothing at build time to show it went missing.',
		passId: RENDER_DATA_MODULE_PASS_ID,
		artifactKeys: ['renderDataModule'],
		source,
		suggestions: [
			{
				message:
					'Register the scoped style virtual module alongside the render-data module it belongs to before the link is read.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_RENDER_DATA_STYLE_UNLINKED',
	};
}

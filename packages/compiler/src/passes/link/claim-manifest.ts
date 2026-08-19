// Pass `claim-manifest`: decides who owns a source's emitted symbol claims and
// what the merged per-source manifest is. Ownership is a compiler fact about a
// module's symbols, so it lives here; the ids those symbols are named by, the
// registry that stores them, and the invalidation a late route artifact needs
// stay with the bundler and arrive as injected inputs. Every contradiction the
// pass finds is a diagnostic carrying this pass id, never a bare throw: the
// caller decides whether a contradiction fails its build.
import type {
	CompilerDiagnostic,
	EmittedClaimOwnership,
	EmittedClaimOwnershipInput,
	LinkedClaimManifest,
	LinkedClaimsArtifact,
	LinkedClaimsInput,
	LinkedResolverClaimVerdict,
	LinkedRouteArtifactRegistration,
	LinkedSourceClaimMerge,
	LinkedSymbolClaimManifest,
} from '../../artifacts.ts';

export const CLAIM_MANIFEST_PASS_ID = 'claim-manifest';

// A manifest speaks for the module it was emitted as. Rebasing is a rename of
// the speaker, never a change to what it claims.
export function linkedClaimManifestForSource<Manifest extends LinkedClaimManifest>(
	manifest: Manifest,
	source: string,
): Manifest {
	return manifest.source === source ? manifest : { ...manifest, source };
}

// The merged claim manifest for one source: sibling emitted modules that share
// a resolver contribute their symbol rows to one manifest, and two owners that
// describe the same symbol differently are a contradiction rather than a
// last-writer-wins merge.
export function mergeLinkedSourceClaims<Manifest extends LinkedClaimManifest>(
	input: LinkedClaimsInput<Manifest>,
): LinkedSourceClaimMerge<Manifest> {
	const candidates = input.claims
		.filter(
			(manifest) =>
				manifest.resolver.virtualModuleId === input.resolverId &&
				manifest.symbols.length > 0,
		)
		.sort((left, right) => left.source.localeCompare(right.source));
	const selected = candidates[0];
	if (!selected) return { manifest: undefined, diagnostics: [] };

	const diagnostics: CompilerDiagnostic[] = [];
	const symbols = new Map<
		string,
		{ readonly owner: string; readonly symbol: Manifest['symbols'][number] }
	>();
	for (const candidate of candidates) {
		for (const symbol of candidate.symbols) {
			const existing = symbols.get(symbol.symbolId);
			if (!existing) {
				symbols.set(symbol.symbolId, { owner: candidate.source, symbol });
				continue;
			}
			if (claimedSymbolsDiverge(existing.symbol, symbol)) {
				diagnostics.push(
					divergedClaimsDiagnostic(input.source, existing.owner, candidate.source),
				);
			}
		}
	}
	return {
		manifest: { ...selected, symbols: [...symbols.values()].map(({ symbol }) => symbol) },
		diagnostics,
	};
}

// Field-wise: serialized text also differs on key order and absent optionals.
function claimedSymbolsDiverge(
	left: LinkedSymbolClaimManifest['symbols'][number],
	right: LinkedSymbolClaimManifest['symbols'][number],
): boolean {
	return (
		left.exportName !== right.exportName ||
		left.kind !== right.kind ||
		left.virtualModuleId !== right.virtualModuleId
	);
}

function divergedClaimsDiagnostic(
	source: string,
	firstOwner: string,
	secondOwner: string,
): CompilerDiagnostic {
	return {
		code: 'MARKLESS_SOURCE_SYMBOL_CLAIMS_DIVERGED',
		severity: 'error',
		phase: 'capture-analysis',
		title: 'Emitted symbol claims for one source disagree',
		message: `MARKLESS_SOURCE_SYMBOL_CLAIMS_DIVERGED: Source ${JSON.stringify(source)} has incompatible emitted symbol claims in ${JSON.stringify(firstOwner)} and ${JSON.stringify(secondOwner)}.`,
		why: 'Merging contradictory claims would let one emitted sibling silently redefine a symbol another sibling already routes to.',
		passId: CLAIM_MANIFEST_PASS_ID,
		artifactKeys: [firstOwner, secondOwner],
		source,
		suggestions: [
			{
				message:
					'Rebuild the source so every emitted sibling publishes the same rows for a shared symbol, and clear any stale build cache.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SOURCE_SYMBOL_CLAIMS_DIVERGED',
	};
}

// The `linkedClaims` artifact: per-source merged manifests beside the exact
// emitted-module owners they were merged from. Per-build, never serialized.
export function linkClaimManifests<Manifest extends LinkedClaimManifest>(input: {
	readonly byEmittedModule: ReadonlyMap<string, Manifest>;
	readonly sources: ReadonlyArray<{ readonly source: string; readonly resolverId: string }>;
}): LinkedClaimsArtifact<Manifest> {
	const claims = [...input.byEmittedModule.values()];
	const bySource: Record<string, Manifest> = {};
	const diagnostics: CompilerDiagnostic[] = [];
	for (const request of input.sources) {
		const merged = mergeLinkedSourceClaims({
			source: request.source,
			resolverId: request.resolverId,
			claims,
		});
		if (merged.manifest) bySource[request.source] = merged.manifest;
		diagnostics.push(...merged.diagnostics);
	}
	return {
		passId: CLAIM_MANIFEST_PASS_ID,
		bySource,
		byEmittedModule: Object.fromEntries(input.byEmittedModule),
		diagnostics,
	};
}

// Which emitted module owns the claims a transform just published, and what it
// publishes. A prerender-wake variant that carries symbols hands its routes to
// the generated resolver and displaces the plain and resume owners of the same
// source; an ineligible wake variant emits no facade and displaces nothing.
export function planEmittedClaimOwnership<Manifest extends LinkedClaimManifest>(
	input: EmittedClaimOwnershipInput<Manifest>,
): EmittedClaimOwnership<Manifest> {
	const claim = linkedClaimManifestForSource(input.manifest, input.emittedModule);
	if (input.naming.isWakeRequest(input.emittedModule) && input.manifest.symbols.length > 0) {
		// The generated resolver owns wake-wrapper symbol routes when it survives
		// the final strip; final claim selection drops this owner if it does not.
		const displacedOwners = input.claimOwners.filter(
			(owner) =>
				input.naming.sourcePathOf(owner) === input.source &&
				(owner === input.source || input.naming.isResumeRequest(owner)),
		);
		if (input.resolverModuleId === undefined) {
			return {
				owner: input.emittedModule,
				manifest: claim,
				displacedOwners,
				diagnostics: [missingWakeResolverDiagnostic(input.source)],
			};
		}
		return {
			owner: input.resolverModuleId,
			manifest: {
				...linkedClaimManifestForSource(input.manifest, input.source),
				resolver: { virtualModuleId: input.resolverModuleId },
			},
			displacedOwners,
			diagnostics: [],
		};
	}
	// An ineligible wake request emits no facade and therefore cannot displace
	// the ordinary source or symbols sibling that still owns these claims.
	const cededToWake =
		input.wakeOwnsRoutes &&
		(input.emittedModule === input.source || input.naming.isResumeRequest(input.emittedModule));
	return {
		owner: input.emittedModule,
		manifest: cededToWake ? { ...claim, symbols: [] } : claim,
		displacedOwners: [],
		diagnostics: [],
	};
}

function missingWakeResolverDiagnostic(source: string): CompilerDiagnostic {
	return {
		code: 'MARKLESS_PRERENDER_WAKE_RESOLVER_MISSING',
		severity: 'error',
		phase: 'capture-analysis',
		title: 'Prerender wake variant has no resolver to own its routes',
		message: 'MARKLESS_PRERENDER_WAKE_RESOLVER_MISSING',
		why: 'A wake variant that carries symbols must hand its symbol routes to a generated resolver; without one the routes would have no owner.',
		passId: CLAIM_MANIFEST_PASS_ID,
		artifactKeys: ['linkedClaims'],
		source,
		suggestions: [
			{ message: 'Emit the generated symbol resolver alongside the wake variant.' },
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_PRERENDER_WAKE_RESOLVER_MISSING',
	};
}

// Two publications of one resolver's final claim set: the superset wins, and
// two sets that neither contain the other are a contradiction.
export function linkedResolverClaimVerdict(input: {
	readonly resolverId: string;
	readonly current: ReadonlyArray<string> | undefined;
	readonly next: ReadonlyArray<string> | undefined;
}): LinkedResolverClaimVerdict {
	const currentClaims = new Set(input.current ?? []);
	const nextClaims = new Set(input.next ?? []);
	const currentContainsNext = [...nextClaims].every((claim) => currentClaims.has(claim));
	const nextContainsCurrent = [...currentClaims].every((claim) => nextClaims.has(claim));
	if (currentContainsNext && !nextContainsCurrent) return { action: 'keep-current' };
	if (currentContainsNext || nextContainsCurrent) return { action: 'replace' };
	return {
		action: 'diverged',
		diagnostic: {
			code: 'MARKLESS_RESOLVER_CLAIMS_DIVERGED',
			severity: 'error',
			phase: 'capture-analysis',
			title: 'Resolver claim sets disagree',
			message: `MARKLESS_RESOLVER_CLAIMS_DIVERGED: Resolver ${JSON.stringify(input.resolverId)} has incompatible final claim sets.`,
			why: 'Neither claim set contains the other, so accepting either would drop symbol routes the resolver still owns.',
			passId: CLAIM_MANIFEST_PASS_ID,
			artifactKeys: ['linkedClaims'],
			source: input.resolverId,
			suggestions: [
				{ message: 'Rebuild the owning module so both publications claim the same set.' },
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_RESOLVER_CLAIMS_DIVERGED',
		},
	};
}

// Whether a source may still take ownership of a client route artifact. A
// production build that has already transformed the primary module cannot: the
// artifact would be registered after the module that had to see it. Development
// re-invalidates instead, which is the caller's I/O.
export function linkedRouteArtifactRegistration(input: {
	readonly source: string;
	readonly registered: boolean;
	readonly primaryTransformed: boolean;
	readonly dev: boolean;
}): LinkedRouteArtifactRegistration {
	if (input.registered) return { action: 'already-registered', diagnostics: [] };
	if (!input.primaryTransformed) return { action: 'register', diagnostics: [] };
	if (input.dev) return { action: 'reinvalidate', diagnostics: [] };
	return {
		action: 'late',
		diagnostics: [
			{
				code: 'MARKLESS_ROUTE_ARTIFACT_REGISTERED_LATE',
				severity: 'error',
				phase: 'capture-analysis',
				title: 'Client route artifact registered after its primary module transformed',
				message: `MARKLESS_ROUTE_ARTIFACT_REGISTERED_LATE: Client route artifact ${JSON.stringify(input.source)} was registered after its primary module transformed. Register every production route artifact before transformation begins.`,
				why: 'The primary module has already been compiled without knowing it composes a route artifact, so its emitted graph would be wrong.',
				passId: CLAIM_MANIFEST_PASS_ID,
				artifactKeys: ['linkedClaims'],
				source: input.source,
				suggestions: [
					{
						message:
							'Register every production route artifact before transformation begins.',
					},
				],
				docsUrl: 'https://markless.dev/errors/MARKLESS_ROUTE_ARTIFACT_REGISTERED_LATE',
			},
		],
	};
}

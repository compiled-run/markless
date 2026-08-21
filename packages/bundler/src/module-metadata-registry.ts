import type { MarklessTransformManifest } from './types.ts';

type CaptureMetadata = NonNullable<MarklessTransformManifest['captureMetadata']>;
type CaptureManifest = Pick<MarklessTransformManifest, 'captureMetadata'>;

/**
 * One source's publication ledger.
 *
 * `begun` and `published` are cumulative facts about this source's emitted
 * variants and answer the barrier every reader shares. `expected` and `pending`
 * are one importer's own wait list for its own seal - a prediction of the claim
 * routes it is about to force - and answer only `sealSourceSymbolClaims`.
 * `activeModules` is what is in flight right now.
 */
type SourceClaimPublication = {
	active: number;
	activeModules: Set<string>;
	begun: Set<string>;
	expected: Set<string>;
	finalized: Set<string>;
	pending: Set<string>;
	published: Set<string>;
	revision: number;
	sealed: boolean;
	waiters: Array<() => void>;
};

/**
 * Capture data follows authored source identity. Symbol claims follow the exact
 * emitted module identity that owns the corresponding loadSymbol route.
 */
export class ModuleMetadataRegistry {
	readonly #captureManifestsBySource = new Map<string, CaptureManifest>();
	readonly #symbolClaimsByEmittedModule = new Map<string, MarklessTransformManifest>();
	readonly #sourceClaimPublications = new Map<string, SourceClaimPublication>();

	#publication(source: string): SourceClaimPublication {
		const existing = this.#sourceClaimPublications.get(source);
		if (existing) return existing;
		const created: SourceClaimPublication = {
			active: 0,
			activeModules: new Set<string>(),
			begun: new Set<string>(),
			expected: new Set<string>(),
			finalized: new Set<string>(),
			pending: new Set<string>(),
			published: new Set<string>(),
			revision: 0,
			sealed: false,
			waiters: [],
		};
		this.#sourceClaimPublications.set(source, created);
		return created;
	}

	// Every state change wakes every waiter; each one re-checks its own condition.
	static #changed(publication: SourceClaimPublication): void {
		publication.revision += 1;
		for (const resolve of publication.waiters.splice(0)) resolve();
	}

	// Complete: every emitted variant that has ever begun publishing has finished
	// at least one publication, so the claims they own are all in the registry.
	static #complete(publication: SourceClaimPublication): boolean {
		for (const emittedModule of publication.begun) {
			if (!publication.published.has(emittedModule)) return false;
		}
		return true;
	}

	// Still worth waiting for: a variant is compiling right now and has never
	// published, so its claims are genuinely missing rather than a generation old.
	static #awaited(publication: SourceClaimPublication): boolean {
		for (const emittedModule of publication.activeModules) {
			if (!publication.published.has(emittedModule)) return true;
		}
		return false;
	}

	clear(): void {
		this.#captureManifestsBySource.clear();
		this.#symbolClaimsByEmittedModule.clear();
		this.#sourceClaimPublications.clear();
	}

	recordCaptureMetadata(source: string, manifest: CaptureManifest): void {
		if (manifest.captureMetadata) this.#captureManifestsBySource.set(source, manifest);
		else this.#captureManifestsBySource.delete(source);
	}

	captureMetadataForSource(source: string): CaptureMetadata | undefined {
		return this.#captureManifestsBySource.get(source)?.captureMetadata;
	}

	deleteCaptureMetadata(source: string): void {
		this.#captureManifestsBySource.delete(source);
	}

	recordSymbolClaims(emittedModule: string, manifest: MarklessTransformManifest): void {
		this.#symbolClaimsByEmittedModule.set(emittedModule, manifest);
	}

	deleteSymbolClaims(emittedModule: string): void {
		this.#symbolClaimsByEmittedModule.delete(emittedModule);
	}

	hasSymbolClaims(emittedModule: string): boolean {
		return this.#symbolClaimsByEmittedModule.has(emittedModule);
	}

	beginSourceSymbolClaims(source: string, emittedModule: string): void {
		const publication = this.#publication(source);
		publication.sealed = false;
		publication.finalized.delete(emittedModule);
		if (publication.expected.has(emittedModule)) publication.pending.add(emittedModule);
		publication.begun.add(emittedModule);
		publication.activeModules.add(emittedModule);
		publication.active += 1;
		ModuleMetadataRegistry.#changed(publication);
	}

	expectSourceSymbolClaims(source: string, emittedModules: Iterable<string>): void {
		const publication = this.#publication(source);
		for (const emittedModule of emittedModules) {
			publication.expected.add(emittedModule);
			if (!publication.finalized.has(emittedModule)) publication.pending.add(emittedModule);
		}
		publication.sealed = false;
		ModuleMetadataRegistry.#changed(publication);
	}

	finishSourceSymbolClaims(source: string, emittedModule: string): void {
		const publication = this.#sourceClaimPublications.get(source);
		if (!publication || publication.active === 0) {
			throw new Error(
				`MARKLESS_SOURCE_SYMBOL_CLAIMS_FINAL_WITHOUT_START: Source ${JSON.stringify(source)} published final claims without an active emitted variant.`,
			);
		}
		publication.active -= 1;
		publication.activeModules.delete(emittedModule);
		publication.finalized.add(emittedModule);
		publication.published.add(emittedModule);
		publication.pending.delete(emittedModule);
		ModuleMetadataRegistry.#changed(publication);
	}

	/**
	 * Drops an edited module's claims and the ledger entry that remembers it ever
	 * published them, so the transform that recompiles it counts as a first
	 * publication the barrier waits on rather than a republication it waves past.
	 * Displacement between emitted siblings is not this: those owners ceded their
	 * routes on purpose and stay published.
	 */
	invalidateSourceSymbolClaims(source: string, emittedModule: string): void {
		this.deleteSymbolClaims(emittedModule);
		const publication = this.#sourceClaimPublications.get(source);
		if (!publication) return;
		publication.begun.delete(emittedModule);
		publication.published.delete(emittedModule);
		publication.finalized.delete(emittedModule);
		ModuleMetadataRegistry.#changed(publication);
	}

	// A compile that threw publishes nothing; release it so readers stop waiting.
	// The variant stays unpublished, so the barrier still fails closed.
	releaseSourceSymbolClaims(source: string, emittedModule: string): void {
		const publication = this.#sourceClaimPublications.get(source);
		if (!publication || !publication.activeModules.has(emittedModule)) return;
		publication.active -= 1;
		publication.activeModules.delete(emittedModule);
		ModuleMetadataRegistry.#changed(publication);
	}

	async sealSourceSymbolClaims(source: string): Promise<void> {
		const publication = this.#sourceClaimPublications.get(source);
		if (!publication || publication.sealed) return;
		for (;;) {
			while (publication.active > 0 || publication.pending.size > 0) {
				await new Promise<void>((resolve) => publication.waiters.push(resolve));
			}
			const revision = publication.revision;
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			if (
				publication.revision === revision &&
				publication.active === 0 &&
				publication.pending.size === 0
			) {
				break;
			}
		}
		publication.sealed = true;
	}

	/**
	 * The barrier, waited on instead of asserted. A reader in an environment that
	 * does not drive this source's publication - an SSR transform reading a child's
	 * client claims - has no seal of its own, so it blocks here until every emitted
	 * variant in flight has published. Returns as soon as nothing is left to wait
	 * for, whether or not the result satisfies the barrier: deciding that is
	 * `assertSourceClaimsSealed`'s, and it stays fail-closed.
	 */
	async awaitSourceClaimsPublished(source: string): Promise<void> {
		const publication = this.#sourceClaimPublications.get(source);
		if (!publication) return;
		while (ModuleMetadataRegistry.#awaited(publication)) {
			await new Promise<void>((resolve) => publication.waiters.push(resolve));
		}
	}

	symbolClaimManifests(): IterableIterator<MarklessTransformManifest> {
		return this.#symbolClaimsByEmittedModule.values();
	}

	symbolClaimMap(): ReadonlyMap<string, MarklessTransformManifest> {
		return this.#symbolClaimsByEmittedModule;
	}

	/**
	 * The publication barrier every reader shares: an emitted sibling that has
	 * begun publishing must have finished a publication before its source's claims
	 * may be read, so the merged manifest is a complete set rather than half of
	 * one. A sibling compiling again has already published once, so a second
	 * importer forcing it - ordinary in a dev server serving several importers at
	 * once - is not a barrier failure. One importer's expectation list is not part
	 * of this: that is its own `sealSourceSymbolClaims` wait, not a fact about the
	 * source, and enforcing it here made the read order-dependent. Merging the
	 * claims is the `claim-manifest` compiler pass, not this registry.
	 */
	assertSourceClaimsSealed(source: string): void {
		const publication = this.#sourceClaimPublications.get(source);
		if (!publication || ModuleMetadataRegistry.#complete(publication)) return;
		const unpublished = [...publication.begun].filter(
			(emittedModule) => !publication.published.has(emittedModule),
		);
		throw new Error(
			`MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED: Source ${JSON.stringify(source)} claims were consumed before final publication completed. Emitted variants that have not published: ${unpublished.map((emittedModule) => JSON.stringify(emittedModule)).join(', ')}.`,
		);
	}

	emittedSymbolClaimMap(
		emittedModules: Iterable<string>,
	): ReadonlyMap<string, MarklessTransformManifest> {
		const emitted = new Set(emittedModules);
		return new Map(
			[...this.#symbolClaimsByEmittedModule].filter(([owner]) => emitted.has(owner)),
		);
	}
}

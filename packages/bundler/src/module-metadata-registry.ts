import type { MarklessTransformManifest } from './types.ts';

type CaptureMetadata = NonNullable<MarklessTransformManifest['captureMetadata']>;
type CaptureManifest = Pick<MarklessTransformManifest, 'captureMetadata'>;

/**
 * Capture data follows authored source identity. Symbol claims follow the exact
 * emitted module identity that owns the corresponding loadSymbol route.
 */
export class ModuleMetadataRegistry {
	readonly #captureManifestsBySource = new Map<string, CaptureManifest>();
	readonly #symbolClaimsByEmittedModule = new Map<string, MarklessTransformManifest>();
	readonly #sourceClaimPublications = new Map<
		string,
		{
			active: number;
			expected: Set<string>;
			finalized: Set<string>;
			pending: Set<string>;
			revision: number;
			sealed: boolean;
			waiters: Array<() => void>;
		}
	>();

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
		const publication = this.#sourceClaimPublications.get(source) ?? {
			active: 0,
			expected: new Set<string>(),
			finalized: new Set<string>(),
			pending: new Set<string>(),
			revision: 0,
			sealed: false,
			waiters: [],
		};
		publication.sealed = false;
		publication.finalized.delete(emittedModule);
		if (publication.expected.has(emittedModule)) publication.pending.add(emittedModule);
		publication.active += 1;
		publication.revision += 1;
		this.#sourceClaimPublications.set(source, publication);
	}

	expectSourceSymbolClaims(source: string, emittedModules: Iterable<string>): void {
		const publication = this.#sourceClaimPublications.get(source) ?? {
			active: 0,
			expected: new Set<string>(),
			finalized: new Set<string>(),
			pending: new Set<string>(),
			revision: 0,
			sealed: false,
			waiters: [],
		};
		for (const emittedModule of emittedModules) {
			publication.expected.add(emittedModule);
			if (!publication.finalized.has(emittedModule)) publication.pending.add(emittedModule);
		}
		publication.sealed = false;
		publication.revision += 1;
		this.#sourceClaimPublications.set(source, publication);
	}

	finishSourceSymbolClaims(source: string, emittedModule: string): void {
		const publication = this.#sourceClaimPublications.get(source);
		if (!publication || publication.active === 0) {
			throw new Error(
				`MARKLESS_SOURCE_SYMBOL_CLAIMS_FINAL_WITHOUT_START: Source ${JSON.stringify(source)} published final claims without an active emitted variant.`,
			);
		}
		publication.active -= 1;
		publication.finalized.add(emittedModule);
		publication.pending.delete(emittedModule);
		publication.revision += 1;
		if (publication.active !== 0 || publication.pending.size !== 0) return;
		for (const resolve of publication.waiters.splice(0)) resolve();
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

	symbolClaimManifests(): IterableIterator<MarklessTransformManifest> {
		return this.#symbolClaimsByEmittedModule.values();
	}

	symbolClaimMap(): ReadonlyMap<string, MarklessTransformManifest> {
		return this.#symbolClaimsByEmittedModule;
	}

	/** Combine sibling emitted-module claims by symbol identity; contradictions stay fail-closed. */
	sourceSymbolClaims(source: string, resolverId: string): MarklessTransformManifest | undefined {
		const publication = this.#sourceClaimPublications.get(source);
		if (publication && (publication.active > 0 || publication.pending.size > 0)) {
			throw new Error(
				`MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED: Source ${JSON.stringify(source)} claims were consumed before final publication completed.`,
			);
		}
		const candidates = [...this.#symbolClaimsByEmittedModule.values()]
			.filter(
				(manifest) =>
					manifest.resolver.virtualModuleId === resolverId && manifest.symbols.length > 0,
			)
			.sort((left, right) => left.source.localeCompare(right.source));
		const selected = candidates[0];
		if (!selected) return undefined;

		const symbols = new Map<
			string,
			{
				readonly owner: string;
				readonly symbol: MarklessTransformManifest['symbols'][number];
			}
		>();
		for (const candidate of candidates) {
			for (const symbol of candidate.symbols) {
				const existing = symbols.get(symbol.symbolId);
				if (!existing) {
					symbols.set(symbol.symbolId, { owner: candidate.source, symbol });
					continue;
				}
				if (JSON.stringify(existing.symbol) !== JSON.stringify(symbol)) {
					throw new Error(
						`MARKLESS_SOURCE_SYMBOL_CLAIMS_DIVERGED: Source ${JSON.stringify(source)} has incompatible emitted symbol claims in ${JSON.stringify(existing.owner)} and ${JSON.stringify(candidate.source)}.`,
					);
				}
			}
		}
		return { ...selected, symbols: [...symbols.values()].map(({ symbol }) => symbol) };
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

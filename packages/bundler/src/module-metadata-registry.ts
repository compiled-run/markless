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

	clear(): void {
		this.#captureManifestsBySource.clear();
		this.#symbolClaimsByEmittedModule.clear();
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

	symbolClaimManifests(): IterableIterator<MarklessTransformManifest> {
		return this.#symbolClaimsByEmittedModule.values();
	}

	symbolClaimMap(): ReadonlyMap<string, MarklessTransformManifest> {
		return this.#symbolClaimsByEmittedModule;
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

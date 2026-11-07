import { asyncPlanes } from '../reconcile-plane-slot.ts';
import type { CsrRenderContainer, CsrRenderOutput } from '../render.ts';
import {
	RESUME_CACHE_SCOPE_ATTRIBUTE,
	RESUME_CACHE_SEEDED_ATTRIBUTE,
	resumeCacheStorageKey,
} from '../resume-cache-storage-key.ts';

type CacheHook = NonNullable<typeof asyncPlanes.cache>;
type Wiring = Parameters<CacheHook>[0];
type Boundary = Parameters<CacheHook>[1];
type Range = Pick<Boundary, 'startAnchor' | 'endAnchor'>;
type Node = { readonly nodeType?: number; readonly nextSibling?: Node | null } & Partial<
	Pick<Element, 'setAttribute' | 'removeAttribute'>
>;

/** Seeds a client mount from the cache; resolves to what settles its seeded boundaries before it mounts. */
export type ResumeCacheSeed = (
	output: CsrRenderOutput,
) => Promise<((container: CsrRenderContainer) => Promise<void>) | undefined> | undefined;
export type ResumeCacheHost = { __mSeed?: ResumeCacheSeed };

export type ResumeCacheContext = {
	readonly exclude: ReadonlyArray<string>;
	readonly key: (wiring: Wiring, boundaryId: string) => string | undefined;
	readonly storage: () => Storage | undefined;
};

let exclude: ReadonlyArray<string> = [];
const routes = new WeakMap<object, string>();
const queued = new Map<Boundary, Wiring>();
const revalidating = new WeakSet<Boundary>();
const waiters = new WeakMap<object, Map<string, () => void>>();

/** Installed by each compiled module that serves async values, unless the app turned the resume cache off. */
export function installMarklessResumeCache(excluded?: ReadonlyArray<string>): void {
	if (excluded) exclude = excluded;
	if (asyncPlanes.cache) return;
	asyncPlanes.cache = settled;
	(globalThis as ResumeCacheHost).__mSeed = seed;
}

function storage(): Storage | undefined {
	try {
		return sessionStorage;
	} catch {
		return undefined;
	}
}

// The token travels in the document the server rendered; a client mount after its container left keeps this document's last one.
function scope(): string | null | undefined {
	const held = document as Document & { __mScope?: string | null };
	return (held.__mScope =
		document.querySelector(`[${RESUME_CACHE_SCOPE_ATTRIBUTE}]`)?.getAttribute(RESUME_CACHE_SCOPE_ATTRIBUTE) ??
		held.__mScope);
}

// A container's route is the path it booted on, so a capture that lands after a navigation keys the page it came from.
function key(root: object, build: string | undefined, boundaryId: string): string | undefined {
	const token = scope();
	if (!token || !build) return undefined;
	let route = routes.get(root);
	if (route === undefined) routes.set(root, (route = location.pathname));
	return resumeCacheStorageKey(token, build, route, boundaryId);
}

const context: ResumeCacheContext = {
	get exclude() {
		return exclude;
	},
	key: (wiring, boundaryId) => key(wiring.root, wiring.state?.buildHash, boundaryId),
	storage,
};

function seed(output: CsrRenderOutput): ReturnType<ResumeCacheSeed> {
	if (!scope()) return undefined;
	const hits = (output.view?.asyncBoundaries ?? []).flatMap((boundary) => {
		const name = key(output.root, output.state?.buildHash, boundary.id);
		let raw: string | null | undefined;
		try {
			raw = name && storage()?.getItem(name);
		} catch {}
		return raw ? [{ boundary, key: name!, raw }] : [];
	});
	if (hits.length === 0) return undefined;
	return import('../resume-cache-seed.ts').then((module) => module.seedClientMount(output, hits, context));
}

/** Resolves once the boundary shows the content the cache seeded. */
export function whenSeeded(root: object, boundaryId: string): Promise<void> {
	return new Promise((resolve) => {
		let byId = waiters.get(root);
		if (!byId) waiters.set(root, (byId = new Map()));
		byId.set(boundaryId, resolve);
	});
}

function settled(wiring: Wiring, boundary: Boundary, status: 'fulfilled' | 'rejected'): void {
	// A document without a scope token keeps nothing, and nothing in it was seeded.
	const name = context.key(wiring, boundary.id);
	if (!name) return;
	if (boundary.seeded && !revalidating.has(boundary)) {
		revalidating.add(boundary);
		if (status === 'fulfilled') {
			mark(boundary, true);
			waiters.get(wiring.root)?.get(boundary.id)?.();
			// A refresh always fetches: the seed changes what shows meanwhile, never whether it happens.
			for (const read of boundary.asyncReads) wiring.graph.asyncPlane?.()?.rerun(read.graphNodeId, true);
			return;
		}
	}
	if (boundary.seeded) mark(boundary, false);
	if (status === 'rejected') {
		// Seeded content never outlives a failing source.
		try {
			storage()?.removeItem(name);
		} catch {}
		queued.delete(boundary);
		return;
	}
	if (queued.size === 0)
		(globalThis.requestIdleCallback ?? setTimeout)(() => {
			const batch = new Map(queued);
			queued.clear();
			void import('../resume-cache-capture.ts').then((module) => module.captureSettled(batch, context));
		});
	queued.set(boundary, wiring);
}

function mark(boundary: Range, seeded: boolean): void {
	for (
		let node = (boundary.startAnchor as Node).nextSibling;
		node && node !== (boundary.endAnchor as unknown as Node);
		node = node.nextSibling
	)
		if (node.nodeType === 1)
			if (seeded) node.setAttribute?.(RESUME_CACHE_SEEDED_ATTRIBUTE, '');
			else node.removeAttribute?.(RESUME_CACHE_SEEDED_ATTRIBUTE);
}

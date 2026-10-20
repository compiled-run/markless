import { chunkCoordinateOrder } from '@markless/serializer/render-data-hosts';

const HOST_KEYS = new Set(['hostNodeId', 'parentHostNodeId', 'ownerHostNodeId']);

type FoldableChunk = {
	readonly hosts: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly coordinate: { readonly path: ReadonlyArray<number> };
	}>;
	readonly slots: ReadonlyArray<{
		readonly coordinate: { readonly path: ReadonlyArray<number> };
	}>;
	readonly inertElements?: ReadonlyArray<number>;
};

/**
 * Every host a view record names: event, update, behavior and handle hosts, list
 * parents and owners, IDREF sites, in the shell and in every arm. Locator lists are
 * skipped, so a host no record names is not addressed by being located.
 */
export function addressedHostNodeIds(view: unknown): Set<string> {
	const addressed = new Set<string>();
	(function visit(value: unknown): void {
		if (Array.isArray(value)) {
			for (const item of value) visit(item);
			return;
		}
		if (!value || typeof value !== 'object') return;
		for (const [key, field] of Object.entries(value)) {
			if (key === 'locators') continue;
			if (HOST_KEYS.has(key) && typeof field === 'string') addressed.add(field);
			else visit(field);
		}
	})(view);
	return addressed;
}

/** The chunk as render data serves it: only addressed hosts, every other element a count in `inertElements`. */
export function foldInertHosts<Chunk extends FoldableChunk>(
	chunk: Chunk,
	addressed: ReadonlySet<string>,
): Chunk {
	if (chunk.inertElements || chunk.hosts.every((host) => addressed.has(host.hostNodeId)))
		return chunk;
	const inertElements = [0];
	const hosts: Array<Chunk['hosts'][number]> = [];
	for (const entry of chunkCoordinateOrder(chunk).entries) {
		if (entry.kind === 'host' && !addressed.has(entry.host.hostNodeId)) {
			inertElements[inertElements.length - 1]!++;
			continue;
		}
		if (entry.kind === 'host') hosts.push(entry.host);
		inertElements.push(0);
	}
	return { ...chunk, hosts, inertElements };
}

/** Render data as a module serves it, every chunk folded and the host list cut to addressed hosts. */
export function withInertHostsFolded<
	RenderData extends {
		readonly hosts: ReadonlyArray<{ readonly hostNodeId: string }>;
		readonly chunks: ReadonlyArray<FoldableChunk>;
	},
>(renderData: RenderData, addressed: ReadonlySet<string>): RenderData {
	return {
		...renderData,
		hosts: renderData.hosts.filter((host) => addressed.has(host.hostNodeId)),
		chunks: renderData.chunks.map((chunk) => foldInertHosts(chunk, addressed)),
	};
}

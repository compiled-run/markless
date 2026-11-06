import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import type { SerializedGraphPayload } from '../../serializer/src/value-decode-client.ts';
import { hasLiveSharedDefinitions } from '../../serializer/src/protocol-shared-instances.ts';
import { whenSeeded, type ResumeCacheContext } from './fns/resume-cache.ts';
import type { CsrRenderContainer, CsrRenderOutput } from './render.ts';
import {
	boundaryAsyncRecords,
	parseResumeCacheEntry,
	resumeCacheDependencyKey,
	resumeCacheExcludes,
} from './resume-cache-key.ts';

declare const __MARKLESS_DEV_ENABLED__: boolean;

type Boundary = NonNullable<CsrRenderOutput['view']>['asyncBoundaries'][number];
type Hit = { readonly boundary: Boundary; readonly key: string; readonly raw: string };

/**
 * A client mount's graph-construction input takes each matching entry's fulfilled snapshot, so the runtime
 * commits the @try arm from it before the root mounts and then revalidates it in place.
 */
export async function seedClientMount(
	output: CsrRenderOutput,
	hits: ReadonlyArray<Hit>,
	context: ResumeCacheContext,
): Promise<((container: CsrRenderContainer) => Promise<void>) | undefined> {
	const state = output.state!;
	const view = output.view!;
	if (hasLiveSharedDefinitions(state)) return undefined;
	const values = await stateValues(state);
	const read = (graphNodeId: string, path: ReadonlyArray<string>) =>
		path.reduce<unknown>(
			(value, segment) => (value as Record<string, unknown> | null | undefined)?.[segment],
			values.get(graphNodeId),
		);
	const seeded = new Set<string>();
	const computed = [...state.computed];
	for (const hit of hits) {
		const records = boundaryAsyncRecords(state, hit.boundary.asyncReads);
		const entry = parseResumeCacheEntry(hit.raw);
		const skip = !entry
			? 'malformed-purged'
			: !records || !hit.boundary.updateSymbolId
				? 'no-settle-renderer'
				: resumeCacheExcludes(context.exclude, records)
					? 'excluded'
					: resumeCacheDependencyKey(state, hit.boundary.asyncReads, read) !== entry.k
						? 'dependency-key-mismatch'
						: entry.s.computed.some(
									(patch) =>
										!records.some((record) => record.graphNodeId === patch.graphNodeId) ||
										patch.snapshot?.status !== 'fulfilled',
							  )
							? 'malformed-purged'
							: undefined;
		if (skip) {
			if (skip === 'malformed-purged' || skip === 'excluded')
				try {
					context.storage()?.removeItem(hit.key);
				} catch {}
			devLog(`skipped ${hit.boundary.id}: ${skip} (${hit.key})`);
			continue;
		}
		for (const patch of entry!.s.computed) {
			const at = computed.findIndex((record) => record.graphNodeId === patch.graphNodeId);
			computed[at] = { ...computed[at]!, snapshot: patch.snapshot };
		}
		seeded.add(hit.boundary.id);
		devLog(`seeded ${hit.boundary.id} from ${hit.key}; the runtime revalidates it`);
	}
	if (seeded.size === 0) return undefined;
	Object.assign(output, {
		state: { ...state, computed },
		view: {
			...view,
			asyncBoundaries: view.asyncBoundaries.map((boundary) =>
				seeded.has(boundary.id) ? { ...boundary, seeded: true } : boundary,
			),
		},
	});
	return async (container) => {
		const shown = [...seeded].map((boundaryId) => whenSeeded(container.root, boundaryId));
		await (container.runtime as { readonly start?: () => Promise<void> }).start?.();
		await Promise.all(shown);
	};
}

// What a dependency read answers before the graph exists: the values the mount seeds its cells and computeds with.
async function stateValues(state: ProtocolStatePayload): Promise<Map<string, unknown>> {
	const decode = (await import('../../serializer/src/value-decode-client-lazy.ts'))
		.deserializeGraphValueForClient;
	const values = new Map<string, unknown>();
	for (const record of [...state.cells, ...state.computed]) {
		if (record.directValue !== undefined) values.set(record.graphNodeId, record.directValue);
		else if (record.value !== undefined)
			values.set(record.graphNodeId, await decode(record.value as SerializedGraphPayload));
	}
	return values;
}

function devLog(message: string): void {
	if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__)
		console.info(`[markless] resume cache ${message}`);
}

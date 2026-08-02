import type { DecodedPayloadScripts } from '../../serializer/src/protocol-client.ts';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';

// Show-then-adopt, adopt half (T107 streaming): the __mArm executor already
// swapped settled arm content into the boundary's anchor range pre-runtime;
// the streamed record set and incremental snapshot stayed in the document as
// inert scripts. At wake, this overlay runs BEFORE graph construction and
// record registration, so:
// - the settled snapshot stops the runtime from re-running the computed, and
// - the boundary's armRecords describe the SETTLED arm now in the DOM
//   (arm-relative, D3), never the pending arm the shell payload shipped.
// Patches for ids outside this container's payload are ignored (another
// container owns them). A malformed patch script throws — never half-adopt.
// A template still present in the document is a commit the reveal train has
// QUEUED but not flushed: its boundary still shows @pending, so neither its
// records nor its snapshot may be adopted — the runtime re-demands the
// computed and owns the boundary (the queued commit no-ops at flush).

type StreamPatchScript = {
	readonly getAttribute: (name: string) => string | null;
	readonly textContent?: string | null;
};

type StreamPatchDocumentRoot = {
	readonly ownerDocument?: {
		readonly querySelectorAll?: (selector: string) => Iterable<StreamPatchScript>;
	} | null;
};

export function adoptStreamedArmPatches(
	decoded: DecodedPayloadScripts,
	root: StreamPatchDocumentRoot,
): DecodedPayloadScripts {
	const query = root.ownerDocument?.querySelectorAll?.bind(root.ownerDocument);
	if (!query) return decoded;
	const armScripts = [...query('script[type="markless/arm"][data-boundary]')];
	const patchScripts = [...query('script[type="markless/state-patch"][data-graph-node]')];
	if (armScripts.length === 0 && patchScripts.length === 0) return decoded;

	const uncommittedBoundaryIds = new Set(
		[...query('template[m\\:arm]')].map((template) => template.getAttribute('m:arm')),
	);
	const uncommittedGraphNodeIds = new Set(
		decoded.view.asyncBoundaries
			.filter((boundary) => uncommittedBoundaryIds.has(boundary.id))
			.flatMap((boundary) => boundary.asyncReads.map((read) => read.graphNodeId)),
	);
	const armRecordsByBoundary = new Map(
		armScripts
			.filter((script) => !uncommittedBoundaryIds.has(script.getAttribute('data-boundary')))
			.map((script) => [
				script.getAttribute('data-boundary'),
				JSON.parse(script.textContent ?? 'null') as unknown,
			]),
	);
	const patchByGraphNode = new Map(
		patchScripts
			.filter(
				(script) =>
					!uncommittedGraphNodeIds.has(script.getAttribute('data-graph-node') ?? ''),
			)
			.map((script) => [
				script.getAttribute('data-graph-node'),
				JSON.parse(script.textContent ?? 'null') as { readonly snapshot?: unknown } | null,
			]),
	);

	return {
		state: {
			...decoded.state,
			computed: decoded.state.computed.map((computed) => {
				const snapshot = patchByGraphNode.get(computed.graphNodeId)?.snapshot;
				return snapshot
					? { ...computed, snapshot: snapshot as NonNullable<typeof computed.snapshot> }
					: computed;
			}),
		},
		view: {
			...decoded.view,
			asyncBoundaries: decoded.view.asyncBoundaries.map((boundary) => {
				const armRecords = armRecordsByBoundary.get(boundary.id);
				if (!armRecords) return boundary;
				const snapshot = patchByGraphNode.get(boundary.runnerGraphNodeId ?? '')?.snapshot as
					| { readonly status?: unknown }
					| undefined;
				const initiallyServedArm = snapshot?.status === 'fulfilled'
					? ASYNC_BOUNDARY_ARM.try
					: snapshot?.status === 'rejected'
						? ASYNC_BOUNDARY_ARM.catch
						: boundary.initiallyServedArm;
				return {
					...boundary,
					initiallyServedArm,
					armRecords: armRecords as (typeof boundary)['armRecords'],
				};
			}),
		},
	};
}

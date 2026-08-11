import type { DecodedPayloadScripts } from '../../serializer/src/protocol-client.ts';
import type { ProtocolStatePayload, ProtocolStreamedArmPatch } from '@markless/serializer';
import type { ResumeDomOwnerDocument } from './resume-types.ts';

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

type StreamPatchDocumentRoot = {
	readonly ownerDocument?: ResumeDomOwnerDocument;
};

type StreamedStateDelta = Pick<ProtocolStatePayload, 'cells' | 'computed'>;

export function adoptStreamedArmPatches(
	decoded: DecodedPayloadScripts,
	root: StreamPatchDocumentRoot,
): DecodedPayloadScripts {
	const query = root.ownerDocument?.querySelectorAll?.bind(root.ownerDocument);
	if (!query) return decoded;
	const scripts = [
		...query(
			'script[type="markless/arm"],script[type="markless/state-patch"]',
		),
	];
	if (!scripts.length) return decoded;

	const uncommittedBoundaryIds = new Set(
		[...query('template[m\\:arm]')].map((template) => template.getAttribute('m:arm')),
	);
	const armPatchesByBoundary = new Map<string, ProtocolStreamedArmPatch>();
	const deltas = new Map<string, StreamedStateDelta>();
	for (const script of scripts) {
		const boundaryId = script.getAttribute('data-boundary');
		if (boundaryId) {
			if (!uncommittedBoundaryIds.has(boundaryId))
				armPatchesByBoundary.set(
					boundaryId,
					JSON.parse(script.textContent as string) as ProtocolStreamedArmPatch,
				);
			continue;
		}
		const graphNodeId = script.getAttribute('data-graph-node') ?? '';
		const boundary = decoded.view.asyncBoundaries.find(
			(candidate) => candidate.runnerGraphNodeId === graphNodeId,
		);
		if (!boundary || uncommittedBoundaryIds.has(boundary.id)) continue;
		const delta = JSON.parse(script.textContent as string) as StreamedStateDelta | null;
		if (delta) deltas.set(graphNodeId, delta);
	}
	const cells = mergeStateRecords(decoded.state.cells, deltas.values(), 'cells');
	const computed = mergeStateRecords(decoded.state.computed, deltas.values(), 'computed');

	return {
		state: {
			...decoded.state,
			cells: [...cells.values()],
			computed: [...computed.values()],
		},
		view: {
			...decoded.view,
			asyncBoundaries: decoded.view.asyncBoundaries.map((boundary) => {
				const armPatch = armPatchesByBoundary.get(boundary.id);
				if (!armPatch) return boundary;
				return {
					...boundary,
					initiallyServedArm: armPatch[0],
					armRecords: armPatch[1] as (typeof boundary)['armRecords'],
				};
			}),
		},
	};
}

function mergeStateRecords<
	T extends StreamedStateDelta[keyof StreamedStateDelta][number],
	K extends keyof StreamedStateDelta,
>(
	base: ReadonlyArray<T>,
	deltas: Iterable<StreamedStateDelta>,
	key: K,
): Map<string, T> {
	const records = new Map(base.map((record) => [record.graphNodeId, record]));
	for (const delta of deltas)
		for (const addition of delta[key] as ReadonlyArray<T>) {
			const current = records.get(addition.graphNodeId);
			records.set(addition.graphNodeId, current ? { ...current, ...addition } : addition);
		}
	return records;
}

import type { DecodedPayloadScripts } from '../../serializer/src/protocol-client.ts';

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

	const armRecordsByBoundary = new Map(
		armScripts.map((script) => [
			script.getAttribute('data-boundary'),
			JSON.parse(script.textContent ?? 'null') as unknown,
		]),
	);
	const patchByGraphNode = new Map(
		patchScripts.map((script) => [
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
				return armRecords
					? { ...boundary, armRecords: armRecords as (typeof boundary)['armRecords'] }
					: boundary;
			}),
		},
	};
}

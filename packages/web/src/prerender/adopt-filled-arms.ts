import type { DecodedPayloadScripts } from '../../../serializer/src/protocol-client-storage.ts';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer';
import type { MarklessSettledArmHandoff } from '../inline/resumer.ts';
import type { RuntimeGraph } from '@markless/runtime';

export type SettledArmRoot = {
	readonly __marklessSettledArms?: ReadonlyArray<MarklessSettledArmHandoff>;
};

type RenderedArm = {
	readonly armRecords?: unknown;
	readonly computed?: ReadonlyArray<Record<string, unknown>>;
};

export type RenderSettledBoundary = (
	boundaryId: string,
	status: 'fulfilled' | 'rejected',
	graph: RuntimeGraph,
) => RenderedArm | Promise<RenderedArm>;

// The inline settle boot already filled a boundary's arm from the fill plan, so
// the DOM shows the settled arm while the records the wake was built with still
// describe @pending. Re-derive that boundary's arm records from the SAME settled
// value the boot used — the filler's DOM is the server renderer's DOM for that
// value, so the records land on it exactly — and adopt the settled snapshot so
// the runtime does not re-run the computed and re-render an arm that is already
// correct. Both wake paths call this: whichever group wakes first owns the arm,
// so a state change it owns still moves bindings that live inside the arm.
export async function adoptFilledArms<T extends DecodedPayloadScripts>(
	input: T,
	root: SettledArmRoot,
	render: RenderSettledBoundary | undefined,
): Promise<T> {
	const handoffs = root.__marklessSettledArms;
	if (!handoffs?.length || !render) return input;
	const boundaries = [...input.view.asyncBoundaries];
	const computed = new Map((input.state.computed ?? []).map((entry) => [entry.graphNodeId, entry]));
	let adopted = false;
	for (const handoff of handoffs) {
		const index = boundaries.findIndex((boundary) => boundary.id === handoff.boundaryId);
		if (index < 0) continue;
		const rendered = await render(handoff.boundaryId, 'fulfilled', {
			read: handoff.read,
		} as never);
		if (!rendered?.armRecords) continue;
		boundaries[index] = {
			...boundaries[index]!,
			initiallyServedArm: ASYNC_BOUNDARY_ARM.try,
			armRecords: rendered.armRecords as (typeof boundaries)[number]['armRecords'],
		};
		for (const entry of rendered.computed ?? [])
			computed.set(entry.graphNodeId as string, {
				...computed.get(entry.graphNodeId as string),
				...entry,
			} as never);
		adopted = true;
	}
	if (!adopted) return input;
	return {
		...input,
		state: { ...input.state, computed: [...computed.values()] },
		view: { ...input.view, asyncBoundaries: boundaries },
	};
}

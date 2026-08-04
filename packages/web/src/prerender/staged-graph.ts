import type { RuntimeGraph } from '@markless/runtime';
import type { ProtocolStatePayload } from '@markless/serializer';

export type PrerenderStagedComputedRegistration = ProtocolStatePayload['computed'][number] & {
	readonly value: unknown;
};

type StagedGraphRegistrar = (
	records: ReadonlyArray<PrerenderStagedComputedRegistration>,
) => void | Promise<void>;

const stagedGraphRegistrars = new WeakMap<RuntimeGraph, StagedGraphRegistrar>();

export function attachPrerenderStagedGraphRegistration(
	graph: RuntimeGraph,
	register: StagedGraphRegistrar,
): void {
	stagedGraphRegistrars.set(graph, register);
}

export function registerPrerenderStagedComputeds(
	graph: RuntimeGraph | undefined,
	records: ReadonlyArray<PrerenderStagedComputedRegistration>,
): void | Promise<void> {
	if (!graph || records.length === 0) return;
	return stagedGraphRegistrars.get(graph)?.(records);
}

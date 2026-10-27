import type {
	ElementHandleQualifier,
	ComposedArmRecordQualifier,
	ComposedBoundaryGraph,
} from './resume-types.ts';
export type { ElementHandleQualifier, ComposedArmRecordQualifier } from './resume-types.ts';

// Registration stays independent of the materialization and instance-scoping implementations.
let elementHandleQualifier: ElementHandleQualifier | undefined;

export function installElementHandleQualifier(qualifier: ElementHandleQualifier): void {
	elementHandleQualifier = qualifier;
}

export function qualifiedElementHandleId(
	handleId: string,
	ownerRecordId: string | undefined,
	graph: unknown,
): string {
	return ownerRecordId && elementHandleQualifier
		? elementHandleQualifier(handleId, ownerRecordId, graph)
		: handleId;
}

let installedQualifier: ComposedArmRecordQualifier | undefined;
let installedBoundaryGraph: ComposedBoundaryGraph | undefined;

export function installComposedArmRecordQualifier(
	qualifier: ComposedArmRecordQualifier,
	boundaryGraph?: ComposedBoundaryGraph,
): void {
	installedQualifier = qualifier;
	installedBoundaryGraph = boundaryGraph;
}

export function composedBoundaryGraph(): ComposedBoundaryGraph | undefined {
	return installedBoundaryGraph;
}

export function composedArmRecordQualifier(): ComposedArmRecordQualifier | undefined {
	return installedQualifier;
}

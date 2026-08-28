/**
 * Re-spells a handle id in the rendered widget's own key space, given the id of
 * the record that filed it. Its own module and it must stay one: the dispatch
 * core reaches fns/instance-scope.ts, which installs this slot, so whatever
 * module hosts it is loaded on every page.
 */
export type ElementHandleQualifier = (
	handleId: string,
	ownerRecordId: string,
	graph?: unknown,
) => string;

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

// The events a container has received and not yet handled: an in-place navigation retires the page only once they are.
export const CONTAINER_HANDLING_PROPERTY = '__mH';

// By event: a promise and what settles it, settled once the handlers ran or one awaits its own work. Only a started runtime opens entries.
export type ContainerHandling = Map<object, readonly [handled: Promise<unknown>, settle: () => void]>;
export type HandlingRoot = { [CONTAINER_HANDLING_PROPERTY]?: ContainerHandling };

export function marklessEventReceived(root: object, event: object): () => void {
	const handling = ((root as HandlingRoot)[CONTAINER_HANDLING_PROPERTY] ??= new Map());
	const entry = handling.get(event);
	if (entry) return entry[1];
	let resolve!: () => void;
	const handled = new Promise<void>((done) => (resolve = done));
	const settle = () => (resolve(), handling.delete(event));
	handling.set(event, [handled, settle]);
	return settle;
}

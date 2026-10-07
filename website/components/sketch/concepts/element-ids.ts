// Numbers each element the first time a figure sees it, so a figure can tell kept elements from new ones.
const ids = new WeakMap<Element, number>();
let next = 1;

export const elementId = (element: Element): { id: number; seen: boolean } => {
	const known = ids.get(element);
	if (known !== undefined) return { id: known, seen: true };
	const id = next++;
	ids.set(element, id);
	return { id, seen: false };
};

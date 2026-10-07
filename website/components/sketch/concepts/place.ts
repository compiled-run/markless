// Measures live elements so marker strokes can sit over them, in percentages that survive a resize.
const pct = (part: number, whole: number): string => Math.round((part / whole) * 1000) / 10 + '%';

const boxStyle = (frame: Element, box: DOMRect, padX: number, padY: number): string => {
	const outer = frame.getBoundingClientRect();
	if (outer.width === 0 || outer.height === 0) return '';
	return (
		'inset:auto;left:' +
		pct(box.left - outer.left - padX, outer.width) +
		';top:' +
		pct(box.top - outer.top - padY, outer.height) +
		';width:' +
		pct(box.width + padX * 2, outer.width) +
		';height:' +
		pct(box.height + padY * 2, outer.height)
	);
};

/** Covers the whole of `target`, grown by `pad` pixels on every side. */
export const placeOver = (
	frame: Element | undefined,
	target: Element | null | undefined,
	pad = 0,
): string => {
	if (!frame || !target) return '';
	return boxStyle(frame, target.getBoundingClientRect(), pad, pad);
};

/** Covers the last run of text inside `target` that matches `pattern`. */
export const placeOverText = (
	frame: Element | undefined,
	target: Element | null | undefined,
	pattern: RegExp,
): string => {
	if (!frame || !target) return '';
	const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
	let found: { node: Node; index: number; length: number } | null = null;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const match = pattern.exec(node.textContent ?? '');
		if (match && match[0].length > 0)
			found = { node, index: match.index, length: match[0].length };
	}
	if (!found) return '';
	const range = document.createRange();
	range.setStart(found.node, found.index);
	range.setEnd(found.node, found.index + found.length);
	const box = range.getBoundingClientRect();
	return boxStyle(frame, box, box.height * 0.3, -box.height * 0.05);
};

/** Runs `read` after the live component has finished reacting to an event. */
export const afterUpdate = (read: () => void): void => {
	setTimeout(read, 0);
};

const watched = new WeakSet<Element>();

/** Calls `read` whenever anything inside `target` changes, from now on. */
export const watchChanges = (target: Element | undefined, read: () => void): void => {
	if (!target || watched.has(target)) return;
	watched.add(target);
	new MutationObserver(read).observe(target, {
		subtree: true,
		childList: true,
		characterData: true,
	});
};

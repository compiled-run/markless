// Plain module functions that receive an element() handle AS A VALUE and do
// observable DOM work with it. Nothing here knows about Markless.
export function markOpened(node: HTMLElement | undefined, label: string) {
	if (!node) return;
	node.setAttribute('data-opened', label);
}

// The alternate shape: the handle is the SECOND argument, the name is different,
// and the work is a real focus() rather than an attribute write.
export function focusTarget(reason: string, target: HTMLElement | undefined) {
	if (!target) return;
	target.setAttribute('ehv-reason', reason);
	target.focus();
}

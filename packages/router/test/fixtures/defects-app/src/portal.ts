// What a ported dialog library does when it opens: move the part to the end of its container's page nodes, then show it.
export function portalToContainerEnd(element: HTMLElement): void {
	const host = element.parentElement?.closest('[data-async-container]');
	if (!host) return;
	let end: ChildNode | null = null;
	for (let node = host.lastChild; node; node = node.previousSibling)
		if (node.nodeType === Node.COMMENT_NODE && (node as Comment).data === 'markless:page-end') {
			end = node;
			break;
		}
	host.insertBefore(document.createElement('span'), end);
	host.insertBefore(element, end);
	element.hidden = false;
}

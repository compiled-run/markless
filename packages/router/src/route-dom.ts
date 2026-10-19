import {
	CONTAINER_ATTRIBUTE,
	PROTOCOL_CONTAINER_END_COMMENT,
	PROTOCOL_CONTAINER_START_COMMENT,
	PROTOCOL_LOCATOR_PATHS_ATTRIBUTE,
} from '@markless/web/fns/container-region';

export const ROUTE_SCRIPT_TYPE = '@markless/core/route';

// Render-context slot where <Html> leaves its attributes for the router's <html> tag.
export const HTML_ATTRIBUTES_SLOT = '__marklessRouterHtmlAttributes';

// Property on a landing page's <html> listing the attribute names the served document gave it, read before any page script runs.
export const SERVED_HTML_ATTRIBUTES_PROPERTY = '__marklessServedHtmlAttributes';

export function servedHtmlAttributesScript(): string {
	return `<script>document.documentElement.${SERVED_HTML_ATTRIBUTES_PROPERTY}=document.documentElement.getAttributeNames()</script>`;
}

export function routeMountTarget(document: Document, currentRoot?: Element) {
	const root =
		currentRoot ?? document.querySelector(`script[type="${ROUTE_SCRIPT_TYPE}"]`)?.parentElement;
	if (!root) return document.body;
	const host = [root, root.parentElement].find((element) => element && containerPageEnd(element));
	if (host) return authorElementTarget(document, host);
	return {
		ownerDocument: document,
		replaceChildren(...children: (Node | string)[]) {
			root.replaceWith(...children);
		},
	};
}

function containerPageEnd(host: Node) {
	for (let node = host.lastChild; node; node = node.previousSibling)
		if (node.nodeType === 8 && (node as Comment).data === PROTOCOL_CONTAINER_END_COMMENT)
			return node as Comment;
	return undefined;
}

function containerPageStart(host: Node) {
	for (let node = host.firstChild; node; node = node.nextSibling)
		if (node.nodeType === 8 && (node as Comment).data === PROTOCOL_CONTAINER_START_COMMENT)
			return node as Comment;
	return undefined;
}

// Each page gets a fresh copy of the author's element, so nothing the last page attached survives.
function authorElementTarget(document: Document, host: Element) {
	const copy = () => {
		const next = host.cloneNode(false) as Element;
		next.removeAttribute(CONTAINER_ATTRIBUTE);
		next.removeAttribute(PROTOCOL_LOCATOR_PATHS_ATTRIBUTE);
		return next;
	};
	let holder: Element | undefined;
	return {
		ownerDocument: document,
		createHolder: () => (holder = copy()),
		replaceChildren(...children: (Node | string)[]) {
			const next = children.length === 1 && children[0] === holder ? holder : copy();
			if (next !== holder) next.append(...children);
			const end = containerPageEnd(host)!;
			const focused = document.activeElement as HTMLElement | null;
			const start = containerPageStart(host);
			if (start) {
				const before: Node[] = [];
				for (let node = host.firstChild; node !== start; node = node!.nextSibling)
					before.push(node!);
				next.prepend(...before, document.createComment(PROTOCOL_CONTAINER_START_COMMENT));
			}
			next.append(document.createComment(PROTOCOL_CONTAINER_END_COMMENT));
			while (end.nextSibling) next.append(end.nextSibling);
			host.replaceWith(next);
			// The document's own nodes moved to the new element; focus inside them stays put.
			if (focused && focused !== document.activeElement && next.contains(focused))
				focused.focus({ preventScroll: true });
		},
	};
}

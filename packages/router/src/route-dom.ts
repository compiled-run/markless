export const ROUTE_SCRIPT_TYPE = '@markless/core/route';

// Render-context slot where <Html> leaves its attributes for the router's <html> tag.
export const HTML_ATTRIBUTES_SLOT = '__marklessRouterHtmlAttributes';

export function routeMountTarget(document: Document, currentRoot?: Element) {
	const root =
		currentRoot ?? document.querySelector(`script[type="${ROUTE_SCRIPT_TYPE}"]`)?.parentElement;
	if (!root) return document.body;
	return {
		ownerDocument: document,
		replaceChildren(...children: (Node | string)[]) {
			root.replaceWith(...children);
		},
	};
}

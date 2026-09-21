export const ROUTE_SCRIPT_TYPE = '@markless/core/route';

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

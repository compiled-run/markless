export function documentHandlersMessage(what: string): string {
	return `MARKLESS_ROUTER_DOCUMENT_HANDLERS_UNSUPPORTED: ${what}, but the router serves only the document's HTML and never wires it in the browser, so the handler would never run. Put the handler on an element a page renders, for example in a layout component each page wraps its content in.`;
}

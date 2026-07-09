export function createRouteErrorCard(document: Document, error: unknown): Element {
	const card = document.createElement('section'), title = document.createElement('h1'), message = document.createElement('pre');
	card.setAttribute('data-markless-region-error', '');
	card.setAttribute('style', 'position:fixed;inset:16px;z-index:2147483647;overflow:auto;border:1px solid #b91c1c;background:#fff;color:#111;padding:16px;font:14px/1.45 system-ui,sans-serif');
	Object.assign(title, { textContent: 'Route render failed' });
	Object.assign(message, { textContent: error instanceof Error ? error.message : String(error) });
	card.append(title, message);
	return card;
}

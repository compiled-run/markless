const proof = globalThis.__resumerProof;
proof.symbolModules++;
proof.receipts.push({ stage: 'lazy-symbol-loaded', symbol: 'click' });
document.body.dataset.symbolModules = String(proof.symbolModules);

export async function onClick({ element, root }) {
	const count = Number(root.getAttribute('data-count')) + 1;
	root.setAttribute('data-count', String(count));
	element.textContent = `Count ${count}`;
	proof.handlers++;
	document.body.dataset.handlers = String(proof.handlers);
	proof.receipts.push({ stage: 'handler-run', eventName: 'click', count });
}

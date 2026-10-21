(() => {
	const figures = () => [...document.querySelectorAll('[data-tail]')];
	const unfinished = () =>
		figures().filter((figure) => figure.children.length !== Number(figure.dataset.count))
			.length;
	const seen = (window.__tailSeen = []);
	window.__tailRuns = (window.__tailRuns || 0) + 1;
	window.__tailAtRun = { figures: figures().length, unfinished: unfinished() };
	document.addEventListener('DOMContentLoaded', () => {
		window.__tailAtReady = { figures: figures().length, unfinished: unfinished() };
	});
	// What a chart library does: lay its figures out again whenever the page changes size or content.
	new ResizeObserver(() => seen.push(unfinished())).observe(document.documentElement);
	new MutationObserver(() => seen.push(unfinished())).observe(document.documentElement, {
		childList: true,
		subtree: true,
	});
})();

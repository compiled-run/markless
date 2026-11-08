// The floating navbar slides away while the reader scrolls down the page and comes back on the way up, as the QDS docs header does.
(() => {
	const THRESHOLD = 100;
	const root = document.documentElement;
	let last = scrollY;
	addEventListener(
		'scroll',
		() => {
			const y = scrollY;
			if (document.querySelector('.nav-pill[ui-open]')) {
				last = y;
				return;
			}
			root.toggleAttribute('data-nav-away', y > last && y > THRESHOLD);
			last = y;
		},
		{ passive: true },
	);
	document.addEventListener('focusin', (event) => {
		if (event.target instanceof Element && event.target.closest('.nav-pill')) root.removeAttribute('data-nav-away');
	});
	// Before any link or history step leaves the page, the sidebar records the section the reader was in, so it stays open on the next page.
	const leaving = () => document.getElementById('docs-sidebar')?.dispatchEvent(new CustomEvent('sidebarleave'));
	document.addEventListener(
		'click',
		(event) => {
			const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
			if (link && link.origin === location.origin && link.pathname !== location.pathname) leaving();
		},
		true,
	);
	addEventListener('popstate', leaving, true);
	// After a page swaps in, or once this page has loaded, the sidebar reopens the sections the reader keeps open.
	const arriving = () => document.getElementById('docs-sidebar')?.dispatchEvent(new CustomEvent('sidebararrive'));
	document.addEventListener('marklessrouterrendered', arriving);
	if (document.readyState === 'complete') arriving();
	else addEventListener('load', arriving, { once: true });
	// The full-screen menu belongs to the narrow layout: widening past it closes the menu, or the page would stay inert behind a menu nobody can see.
	matchMedia('(min-width: 80rem) and (min-height: 37.5rem)').addEventListener('change', (event) => {
		if (!event.matches) return;
		if (document.querySelector('.menu-backdrop:not([hidden])'))
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	});
})();

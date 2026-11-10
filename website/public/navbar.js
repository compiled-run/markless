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
	// The sidebar keeps the sections a reader has open across pages. It is told only when the page would otherwise lose
	// one, so a reader with nothing to keep never wakes its code.
	const sidebar = () => document.getElementById('docs-sidebar');
	const kept = () => (root.getAttribute('data-sidebar-sections') ?? '').split(' ').filter(Boolean);
	const leaving = () => {
		const token = sidebar()?.querySelector('.branch[aria-expanded="true"]:has([aria-current="page"])')?.getAttribute('data-section');
		if (token && !kept().includes(token)) sidebar().dispatchEvent(new CustomEvent('sidebarleave'));
	};
	const arriving = () => {
		const closed = kept().some((token) => sidebar()?.querySelector(`.branch[data-section="${token}"][aria-expanded="false"]`));
		if (closed) sidebar().dispatchEvent(new CustomEvent('sidebararrive'));
	};
	document.addEventListener(
		'click',
		(event) => {
			const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
			if (link && link.origin === location.origin && link.pathname !== location.pathname) leaving();
		},
		true,
	);
	addEventListener('popstate', leaving, true);
	document.addEventListener('marklessrouterrendered', arriving);
	const idle = () => (window.requestIdleCallback ?? setTimeout)(arriving);
	if (document.readyState === 'complete') idle();
	else addEventListener('load', idle, { once: true });
	// The full-screen menu belongs to the narrow layout: widening past it closes the menu, or the page would stay inert behind a menu nobody can see.
	matchMedia('(min-width: 80rem) and (min-height: 37.5rem)').addEventListener('change', (event) => {
		if (!event.matches) return;
		if (document.querySelector('.menu-backdrop:not([hidden])'))
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	});
})();

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
})();

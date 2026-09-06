// Theme normalizer: the router's seed script stamps the STORED theme, which
// can be 'system'. Resolve it so data-theme is always exactly 'dark' or
// 'light' — every dark rule in CSS hangs off [data-theme='dark'] alone, with
// no prefers-color-scheme twin. Follows OS changes only while no explicit
// choice is stored, and re-resolves if anything stamps 'system' again later.
// Loaded synchronously in the document head so the resolved theme lands
// before first paint.
(() => {
	const html = document.documentElement;
	const mq = matchMedia('(prefers-color-scheme: dark)');
	const explicit = () => {
		let stored = null;
		try {
			stored = localStorage.getItem('theme');
		} catch {}
		if (stored) stored = stored.replace(/"/g, '');
		return stored === 'dark' || stored === 'light';
	};
	const resolve = () => {
		const t = html.getAttribute('data-theme');
		if (t !== 'dark' && t !== 'light') {
			html.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
		}
	};
	resolve();
	mq.addEventListener('change', () => {
		if (!explicit()) {
			html.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
		}
	});
	new MutationObserver(resolve).observe(html, { attributeFilter: ['data-theme'] });
})();

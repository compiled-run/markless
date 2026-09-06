// The stored theme lands on <html> as data-theme and can be 'system'. This
// resolves it against the OS and paints the result as a `dark` or `light`
// class, the only thing the CSS reads. Loaded synchronously in the head so
// the class lands before first paint; re-resolves on every later change.
(() => {
	const html = document.documentElement;
	const mq = matchMedia('(prefers-color-scheme: dark)');
	const paint = () => {
		const stored = html.getAttribute('data-theme');
		const dark = stored === 'dark' || (stored !== 'light' && mq.matches);
		html.classList.toggle('dark', dark);
		html.classList.toggle('light', !dark);
	};
	paint();
	mq.addEventListener('change', paint);
	new MutationObserver(paint).observe(html, { attributeFilter: ['data-theme'] });
})();

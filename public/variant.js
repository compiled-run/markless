(() => {
	const valid = (value) => value === 'a' || value === 'b';
	const requested = new URLSearchParams(location.search).get('variant');
	let saved;
	try {
		saved = localStorage.getItem('variant');
	} catch {}
	const variant = valid(requested) ? requested : valid(saved) ? saved : 'a';
	document.documentElement.setAttribute('data-variant', variant);
	try {
		localStorage.setItem('variant', variant);
	} catch {}
	document.addEventListener('DOMContentLoaded', () => {
		for (const link of document.querySelectorAll('.variant-picker a')) {
			if (link.dataset.variant === variant) link.setAttribute('aria-current', 'true');
		}
	});
})();

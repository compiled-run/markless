(() => {
	const html = document.documentElement;
	const allowed = new Set(['a', 'b', 'c']);
	let variant = new URLSearchParams(location.search).get('variant');

	if (variant && allowed.has(variant)) {
		try {
			localStorage.setItem('variant', variant);
		} catch {}
	} else {
		try {
			variant = localStorage.getItem('variant');
		} catch {}
	}

	if (!variant || !allowed.has(variant)) variant = 'a';
	html.setAttribute('data-variant', variant);
})();

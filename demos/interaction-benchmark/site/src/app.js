// Progressive enhancement only: every table and chart is complete without this script.
document.querySelectorAll('.entrant-filter').forEach((fieldset) => {
	fieldset.hidden = false;
	fieldset.addEventListener('change', () => {
		const shown = new Set([...fieldset.querySelectorAll('input:checked')].map((i) => i.value));
		document.querySelectorAll('[data-entrant]').forEach((el) => {
			if (shown.has(el.dataset.entrant)) el.removeAttribute('data-hidden');
			else el.setAttribute('data-hidden', '');
		});
	});
});

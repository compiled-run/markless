(() => {
	const reduced = matchMedia('(prefers-reduced-motion: reduce)');
	const reset = () => {
		for (const mug of document.querySelectorAll('[data-docs-mug]')) {
			mug.style.setProperty('--gaze-x', '0px');
			mug.style.setProperty('--gaze-y', '0px');
		}
	};
	document.addEventListener('pointermove', (event) => {
		if (reduced.matches || event.pointerType === 'touch') { reset(); return; }
		for (const mug of document.querySelectorAll('[data-docs-mug]')) {
			const bounds = mug.getBoundingClientRect();
			const x = event.clientX - bounds.left - bounds.width / 2;
			const y = event.clientY - bounds.top - bounds.height / 2;
			const distance = Math.max(80, Math.hypot(x, y));
			mug.style.setProperty('--gaze-x', `${8 * x / distance}px`);
			mug.style.setProperty('--gaze-y', `${6 * y / distance}px`);
		}
	}, { passive: true });
	document.addEventListener('pointerout', (event) => { if (!event.relatedTarget) reset(); });
	window.addEventListener('blur', reset);
	reduced.addEventListener('change', reset);
})();

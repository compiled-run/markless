class MarklessOutline extends HTMLElement {
	#cleanup;

	connectedCallback() {
		queueMicrotask(() => {
			if (!this.isConnected || this.#cleanup) return;
			const rail = this.querySelector('.on-this-page');
			if (!rail) return;
			const entries = [...rail.querySelectorAll('a[href^="#"]')]
				.map((link) => ({ link, heading: document.getElementById(link.hash.slice(1)) }))
				.filter((entry) => entry.heading);
			if (!entries.length) return;
			const controller = new AbortController();
			const header = document.querySelector('.site-header');
			let frame = 0;
			let current;
			const update = () => {
				frame = 0;
				const readingLine = (header?.getBoundingClientRect().bottom ?? 0) + 32;
				let next = entries[0];
				for (const entry of entries) {
					if (entry.heading.getBoundingClientRect().top > readingLine) break;
					next = entry;
				}
				if (scrollY > 0 && Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2)
					next = entries.at(-1);
				if (next !== current) {
					current?.link.removeAttribute('aria-current');
					next.link.setAttribute('aria-current', 'location');
					current = next;
				}
				if (getComputedStyle(rail).position !== 'fixed' || rail.matches(':hover, :focus-within')) return;
				const bounds = rail.getBoundingClientRect();
				const linkBounds = next.link.getBoundingClientRect();
				if (linkBounds.bottom > bounds.bottom) rail.scrollTop += linkBounds.bottom - bounds.bottom + 8;
				else if (linkBounds.top < bounds.top) rail.scrollTop -= bounds.top - linkBounds.top + 8;
			};
			const schedule = () => {
				if (!frame) frame = requestAnimationFrame(update);
			};
			for (const { link } of entries) link.title = link.textContent.trim();
			window.addEventListener('scroll', schedule, { passive: true, signal: controller.signal });
			window.addEventListener('resize', schedule, { passive: true, signal: controller.signal });
			window.addEventListener('hashchange', schedule, { signal: controller.signal });
			const observer = new ResizeObserver(schedule);
			observer.observe(this.closest('main') ?? document.body);
			rail.setAttribute('data-outline-ready', '');
			update();
			this.#cleanup = () => {
				controller.abort();
				observer.disconnect();
				cancelAnimationFrame(frame);
				rail.removeAttribute('data-outline-ready');
				current?.link.removeAttribute('aria-current');
			};
		});
	}

	disconnectedCallback() {
		this.#cleanup?.();
		this.#cleanup = undefined;
	}
}

if (!customElements.get('markless-outline')) customElements.define('markless-outline', MarklessOutline);

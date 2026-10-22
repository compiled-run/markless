class MarklessOutline extends HTMLElement {
	#cleanup;
	#waiting;
	#folding;

	connectedCallback() {
		queueMicrotask(() => this.#fold());
		// The browser's own load-time scroll (reload restore, #fragment) lands at load; reading earlier picks the top heading.
		if (document.readyState === 'complete') queueMicrotask(() => this.#start());
		else {
			this.#waiting = new AbortController();
			addEventListener('load', () => this.#start(), { once: true, signal: this.#waiting.signal });
		}
	}

	#fold() {
		const rail = this.querySelector('.on-this-page');
		const fold = rail?.querySelector('.on-this-page-fold');
		if (!this.isConnected || !fold || this.#folding) return;
		this.#folding = new AbortController();
		const docked = () => getComputedStyle(rail).position === 'fixed';
		if (docked()) fold.open = true;
		rail.addEventListener('click', (event) => {
			if (!docked() && event.target.closest('a')) fold.open = false;
		}, { signal: this.#folding.signal });
	}

	#start() {
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
		const save = () => {
			try {
				if (current) sessionStorage.setItem(`markless-outline:${location.pathname}`, current.heading.id);
			} catch {}
		};
		let current = entries.find((entry) => entry.link.hasAttribute('aria-current'));
		const readingLine = () => (header?.getBoundingClientRect().bottom ?? 0) + 32;
		// A #fragment load can scroll after load; until it does, keep the heading the fragment names.
		let awaitingFragment = entries.some((entry) => entry.link.hash === location.hash && entry.heading.getBoundingClientRect().top > readingLine() + 1);
		const update = () => {
			frame = 0;
			let next = entries[0];
			for (const entry of entries) {
				if (entry.heading.getBoundingClientRect().top > readingLine()) break;
				next = entry;
			}
			if (scrollY > 0 && Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2)
				next = entries.at(-1);
			if (next !== current && (!awaitingFragment || !current)) {
				current?.link.removeAttribute('aria-current');
				next.link.setAttribute('aria-current', 'location');
				current = next;
				save();
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
		window.addEventListener('scroll', () => { awaitingFragment = false; schedule(); }, { passive: true, signal: controller.signal });
		window.addEventListener('resize', schedule, { passive: true, signal: controller.signal });
		window.addEventListener('hashchange', schedule, { signal: controller.signal });
		window.addEventListener('pagehide', save, { signal: controller.signal });
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
	}

	disconnectedCallback() {
		this.#waiting?.abort();
		this.#waiting = undefined;
		this.#folding?.abort();
		this.#folding = undefined;
		this.#cleanup?.();
		this.#cleanup = undefined;
	}
}

if (!customElements.get('markless-outline')) customElements.define('markless-outline', MarklessOutline);

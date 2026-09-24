// Serialized into every holdout document before app scripts (next to the runner's page agent); self-contained.
// Control discovery keyed the same way in every visit, a DOM state signature for the early-click oracle, and
// a mutation clock for input-to-response.
export function pageProbe({ selector, textTypes }) {
	if (window.__holdout) return;
	const epoch = () => performance.timeOrigin + performance.now();
	const H = (window.__holdout = { mutations: [], input: null });
	const labelOf = (el) =>
		(
			el.getAttribute('aria-label') ||
			el.textContent ||
			el.getAttribute('name') ||
			el.getAttribute('placeholder') ||
			''
		)
			.trim()
			.replace(/\s+/g, ' ')
			.replace(/\d+/g, '#')
			.slice(0, 40);
	const keyOf = (el) =>
		el.getAttribute('data-testid') ??
		`${el.getAttribute('role') || el.tagName.toLowerCase()}:${labelOf(el)}`;
	const usable = (el) => {
		if (el.closest('a[href]')) return false;
		if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
		const box = el.getBoundingClientRect();
		if (box.width === 0 || box.height === 0) return false;
		return (
			typeof el.checkVisibility !== 'function' ||
			el.checkVisibility({ visibilityProperty: true, opacityProperty: true })
		);
	};
	const kindOf = (el) => {
		if (el.tagName === 'SELECT') return 'select';
		const type = (el.getAttribute('type') ?? '').toLowerCase();
		if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && textTypes.includes(type)))
			return 'type';
		if (el.isContentEditable || el.getAttribute('role') === 'textbox') return 'type';
		if (el.tagName === 'INPUT' && type === 'file') return 'skip';
		return 'click';
	};
	H.controls = () => {
		const seen = new Set();
		const out = [];
		[...document.querySelectorAll(selector)].forEach((el, ordinal) => {
			if (!usable(el)) return;
			const key = keyOf(el);
			if (seen.has(key)) return;
			seen.add(key);
			out.push({
				key,
				label: labelOf(el),
				ordinal,
				kind: kindOf(el),
				tag: el.tagName.toLowerCase(),
				role: el.getAttribute('role'),
			});
		});
		return out;
	};
	/** Ordinal of the first usable element with this key, or -1 while it is not rendered yet. */
	H.ordinalOf = (key) =>
		[...document.querySelectorAll(selector)].findIndex((el) => usable(el) && keyOf(el) === key);
	H.links = () => {
		const seen = new Set();
		const out = [];
		for (const a of document.querySelectorAll('a[href]')) {
			const url = new URL(a.href, location.href);
			if (
				url.origin !== location.origin ||
				url.pathname === location.pathname ||
				a.target === '_blank' ||
				a.hasAttribute('download')
			)
				continue;
			if (seen.has(url.pathname)) continue;
			const box = a.getBoundingClientRect();
			if (box.width === 0 || box.height === 0) continue;
			seen.add(url.pathname);
			out.push({
				pathname: url.pathname,
				label: (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
				nth: [...document.querySelectorAll('a[href]')].indexOf(a),
			});
		}
		return out;
	};
	/** FNV-1a over text, attributes (not style) and form values of the body; focus and layout are left out. */
	H.signature = () => {
		let h = 0x811c9dc5;
		let n = 0;
		const add = (s) => {
			for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
			n += s.length;
		};
		const walk = (node) => {
			for (let c = node.firstChild; c; c = c.nextSibling) {
				if (c.nodeType === 3) {
					const t = c.data.trim();
					if (t) add(`|${t}`);
				} else if (c.nodeType === 1) {
					if (c.tagName === 'SCRIPT' || c.tagName === 'STYLE' || c.tagName === 'TEMPLATE')
						continue;
					add(`<${c.tagName}`);
					for (const a of c.attributes)
						if (a.name !== 'style') add(` ${a.name}=${a.value}`);
					if (
						'value' in c &&
						(c.tagName === 'INPUT' ||
							c.tagName === 'TEXTAREA' ||
							c.tagName === 'SELECT')
					)
						add(` :v=${c.value}`);
					if ('checked' in c && c.tagName === 'INPUT') add(` :c=${c.checked}`);
					if (c.tagName === 'DIALOG') add(` :o=${c.open}`);
					walk(c);
					add('>');
				}
			}
		};
		if (document.body) walk(document.body);
		return { hash: (h >>> 0).toString(16), chars: n, pathname: location.pathname };
	};
	const onInput = (e) => {
		if (!e.isTrusted || H.input) return;
		const now = epoch();
		// WebKit may report event.timeStamp on the epoch clock instead of relative to timeOrigin.
		const stamp = [performance.timeOrigin + e.timeStamp, e.timeStamp].find(
			(t) => Math.abs(t - now) < 10000,
		);
		H.input = { type: e.type, epoch: stamp ?? now, captureEpoch: now };
	};
	for (const type of ['pointerdown', 'keydown', 'input', 'change'])
		addEventListener(type, onInput, { capture: true });
	H.reset = () => {
		H.input = null;
		H.mutations = [];
		H.firstPresentEpoch = null;
	};
	new MutationObserver((records) => {
		const at = epoch();
		H.lastMutationEpoch = at;
		if (!H.input || H.mutations.length > 2000) return;
		H.mutations.push(at);
		if (H.mutations.length === 1)
			requestAnimationFrame(() =>
				requestAnimationFrame(() => (H.firstPresentEpoch = epoch())),
			);
		void records;
	}).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
	H.response = () => ({
		input: H.input,
		firstMutationEpoch: H.mutations[0] ?? null,
		lastMutationEpoch: H.mutations.at(-1) ?? null,
		mutationCount: H.mutations.length,
		anyMutationEpoch: H.lastMutationEpoch ?? null,
		firstPresentEpoch: H.firstPresentEpoch ?? null,
		fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
		timeOrigin: performance.timeOrigin,
	});
}

export const CONTROL_SELECTOR_EXTRA =
	'[role=slider], [role=radio], [role=combobox], [role=spinbutton], [role=textbox], [role=menuitemcheckbox], [role=menuitemradio], [role=treeitem], [role=gridcell][tabindex], [role=row][tabindex], [contenteditable=""], [contenteditable=true]';

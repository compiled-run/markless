// Serialized by Playwright into every document before app scripts; must stay self-contained.
export function pageAgent() {
	if (window.__bench) return;
	const epoch = () => performance.timeOrigin + performance.now();
	const store = {
		get(key, fallback) {
			try {
				const raw = sessionStorage.getItem(key);
				return raw ? JSON.parse(raw) : fallback;
			} catch {
				return fallback;
			}
		},
		set(key, value) {
			try {
				sessionStorage.setItem(key, JSON.stringify(value));
			} catch {}
		},
	};
	const supportedTypes = (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes) || [];
	const B = (window.__bench = {
		supported: {
			longtask: supportedTypes.includes('longtask'),
			lcp: supportedTypes.includes('largest-contentful-paint'),
			paint: supportedTypes.includes('paint'),
			event: supportedTypes.includes('event'),
		},
		longTasks: [],
		events: [],
		lcp: null,
		armed: null,
		results: store.get('__bench_results', []),
	});
	const docs = store.get('__bench_docs', []);
	B.documentIndex = docs.length;
	docs.push({ url: location.href, timeOrigin: performance.timeOrigin, snapshot: null });
	store.set('__bench_docs', docs);
	if (store.get('__bench_nav_origin', null) === null) store.set('__bench_nav_origin', performance.timeOrigin);
	B.navOrigin = store.get('__bench_nav_origin', performance.timeOrigin);

	try {
		performance.setResourceTimingBufferSize(10000);
	} catch {}
	const observe = (type, options, onEntry) => {
		try {
			new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true, ...options });
		} catch {}
	};
	if (B.supported.longtask) observe('longtask', {}, (e) => B.longTasks.push({ start: e.startTime, duration: e.duration }));
	if (B.supported.lcp) observe('largest-contentful-paint', {}, (e) => (B.lcp = { startTime: e.startTime, size: e.size }));
	if (B.supported.event)
		observe('event', { durationThreshold: 16 }, (e) => {
			if (B.events.length < 500) B.events.push({ name: e.name, startTime: e.startTime, duration: e.duration, interactionId: e.interactionId ?? 0 });
		});

	const visible = (el) => {
		if (!el || !el.isConnected) return false;
		if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
		const r = el.getBoundingClientRect();
		return r.width > 0 && r.height > 0;
	};
	const all = (target) => [...document.querySelectorAll(target.selector)];
	const resolve = (target) => {
		const list = all(target);
		const nth = target.nth ?? 0;
		return list[nth < 0 ? list.length + nth : nth] ?? null;
	};
	const textOf = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
	const path = () => (location.pathname.length > 1 ? location.pathname.replace(/\/+$/, '') : location.pathname);
	const one = (p) => {
		if (p.pathname !== undefined) return path() === p.pathname;
		if (p.scrollY !== undefined) return Math.abs(window.scrollY - p.scrollY) <= (p.tolerance ?? 0);
		if (p.count !== undefined) return all(p.target).filter(visible).length === p.count;
		if (p.texts !== undefined) {
			const texts = all(p.target).filter(visible).map(textOf);
			return texts.length === p.texts.length && texts.every((t, i) => t === p.texts[i]);
		}
		const el = resolve(p.target);
		if (p.visible === false) return !visible(el);
		if (p.present ? !el?.isConnected : !visible(el)) return false;
		if (p.text !== undefined && textOf(el) !== p.text) return false;
		if (p.value !== undefined && el.value !== p.value) return false;
		if (p.checked !== undefined && el.checked !== p.checked) return false;
		if (p.disabled !== undefined && !!el.disabled !== p.disabled) return false;
		if (p.focused !== undefined && (document.activeElement === el) !== p.focused) return false;
		if (p.attr) for (const [name, value] of Object.entries(p.attr)) if (el.getAttribute(name) !== value) return false;
		return true;
	};
	B.check = (predicates) => predicates.every(one);
	B.describe = (predicates) =>
		predicates.map((p) => {
			const el = p.target ? resolve(p.target) : null;
			return {
				predicate: p,
				holds: (() => {
					try {
						return one(p);
					} catch (e) {
						return String(e);
					}
				})(),
				pathname: location.pathname,
				scrollY: window.scrollY,
				matches: p.target ? all(p.target).length : null,
				visible: el ? visible(el) : false,
				text: el ? textOf(el).slice(0, 160) : null,
				value: el && 'value' in el ? el.value : null,
				focused: el ? document.activeElement === el : null,
				attr: el && p.attr ? Object.fromEntries(Object.keys(p.attr).map((k) => [k, el.getAttribute(k)])) : null,
			};
		});

	// Paint-gated actionability: a paint entry exists, and the target is visible, enabled, in the viewport, the hit-test
	// target at its centre (inside the viewport), and in the same box in the current check and the last two animation-frame callbacks.
	const boxOf = (target) => {
		const el = resolve(target);
		if (!visible(el)) return null;
		const r = el.getBoundingClientRect();
		return `${r.left},${r.top},${r.width},${r.height}`;
	};
	const firstPaint = () => {
		const entries = performance.getEntriesByType('paint');
		return entries.find((e) => e.name === 'first-contentful-paint') ?? entries.find((e) => e.name === 'first-paint') ?? null;
	};
	const trackers = new Map();
	const track = (key, target) => {
		let t = trackers.get(key);
		if (t) return t;
		t = { frames: [], scrolled: false };
		trackers.set(key, t);
		const tick = () => {
			if (trackers.get(key) !== t) return;
			t.frames.push(boxOf(target));
			if (t.frames.length > 2) t.frames.shift();
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
		return t;
	};
	B.actionable = (target) => {
		const key = JSON.stringify(target);
		const t = track(key, target);
		const paint = firstPaint();
		if (B.supported.paint && !paint) return null;
		const el = resolve(target);
		if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
		let r = el.getBoundingClientRect();
		if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) {
			el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
			r = el.getBoundingClientRect();
			t.scrolled = true;
		}
		const box = `${r.left},${r.top},${r.width},${r.height}`;
		if (t.frames.length < 2 || t.frames[0] !== box || t.frames[1] !== box) return null;
		const x = r.left + r.width / 2;
		const y = r.top + r.height / 2;
		if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
		const hit = document.elementFromPoint(x, y);
		if (!hit || !(el === hit || el.contains(hit))) return null;
		trackers.delete(key);
		return { x, y, scrolled: t.scrolled, epoch: epoch(), paint: paint ? { name: paint.name, epoch: performance.timeOrigin + paint.startTime } : null };
	};
	B.focus = (target) => {
		const point = B.actionable(target);
		if (!point) return false;
		const el = resolve(target);
		el.focus();
		return document.activeElement === el ? point : false;
	};
	B.fcp = () => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;

	const persist = () => store.set('__bench_armed', B.armed);
	// Presentation estimate: start of the first animation frame after the DOM state, then the next frame callback.
	const present = (armed, stage) => {
		requestAnimationFrame(() => {
			stage.frameEpoch = epoch();
			requestAnimationFrame(() => {
				stage.presentEpoch = epoch();
				persist();
				if (armed.stages.every((s) => s.presentEpoch !== undefined)) {
					armed.done = true;
					B.results.push(armed);
					store.set('__bench_results', B.results);
					if (B.armed === armed) B.armed = null;
					store.set('__bench_armed', null);
				}
			});
		});
	};
	const evaluate = (detectedBy) => {
		const armed = B.armed;
		if (!armed || armed.done || armed.inputEpoch === null) return;
		const stage = armed.stages.find((s) => s.domEpoch === undefined);
		if (!stage) return;
		let ok = false;
		try {
			ok = B.check(stage.expect);
		} catch (error) {
			armed.checkError = String(error);
		}
		const snapshot = armed.watch ? (() => {
			const el = resolve(armed.watch);
			return el ? textOf(el).slice(0, 80) : null;
		})() : null;
		if (armed.observed.at(-1)?.text !== snapshot && armed.observed.length < 40) armed.observed.push({ epoch: epoch(), text: snapshot });
		if (!ok) return;
		stage.domEpoch = epoch();
		stage.detectedBy = detectedBy;
		stage.document = B.documentIndex;
		persist();
		present(armed, stage);
		evaluate(detectedBy);
	};
	let observer = null;
	const watch = () => {
		if (!observer) {
			observer = new MutationObserver(() => evaluate('mutation'));
			observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
		}
		const poll = () => {
			if (!B.armed || B.armed.done) return;
			evaluate('frame');
			requestAnimationFrame(poll);
		};
		requestAnimationFrame(poll);
	};
	B.arm = (spec) => {
		const first = spec.stages.flatMap((s) => s.expect).find((p) => p.target);
		B.armed = {
			actionId: spec.actionId,
			inputEvents: spec.inputEvents,
			documentFallback: !!spec.documentFallback,
			stages: spec.stages.map((s) => ({ name: s.name, expect: s.expect })),
			watch: first ? first.target : null,
			armedEpoch: epoch(),
			armedDocument: B.documentIndex,
			inputEpoch: null,
			inputEventType: null,
			inputTimeStamp: null,
			inputDocument: null,
			observed: [],
			done: false,
		};
		persist();
		watch();
		return B.armed.armedEpoch;
	};
	B.resultFor = (actionId) => B.results.find((r) => r.actionId === actionId) ?? null;
	B.armedState = () => B.armed;

	const onInput = (event) => {
		if (!event.isTrusted && event.type !== 'popstate' && event.type !== 'navigate') return;
		const armed = B.armed;
		if (!armed || armed.done || armed.inputEpoch !== null || !armed.inputEvents.includes(event.type)) return;
		armed.inputEpoch = performance.timeOrigin + event.timeStamp;
		armed.inputCaptureEpoch = epoch();
		armed.inputEventType = event.type;
		armed.inputTimeStamp = event.timeStamp;
		armed.inputDocument = B.documentIndex;
		persist();
		queueMicrotask(() => evaluate('post-input'));
	};
	for (const type of ['pointerdown', 'keydown', 'input', 'popstate']) addEventListener(type, onInput, { capture: true });
	if (window.navigation?.addEventListener) window.navigation.addEventListener('navigate', onInput);

	const resume = (reason) => {
		const pending = store.get('__bench_armed', null);
		if (!pending || pending.done) return;
		B.armed = pending;
		if (pending.inputEpoch === null && pending.documentFallback) {
			pending.inputEpoch = reason === 'document' ? performance.timeOrigin : epoch();
			pending.inputCaptureEpoch = pending.inputEpoch;
			pending.inputEventType = reason === 'document' ? 'document-navigation-start' : 'pageshow-bfcache';
			pending.inputTimeStamp = reason === 'document' ? 0 : performance.now();
			pending.inputDocument = B.documentIndex;
			persist();
		}
		watch();
	};
	resume('document');
	addEventListener('pageshow', (e) => {
		if (e.persisted) resume('bfcache');
	});

	B.snapshot = () => {
		const nav = performance.getEntriesByType('navigation')[0];
		return {
			documentIndex: B.documentIndex,
			url: location.href,
			timeOrigin: performance.timeOrigin,
			fcpMs: B.supported.paint ? B.fcp() : null,
			lcpMs: B.lcp ? B.lcp.startTime : null,
			supported: B.supported,
			longTasks: B.supported.longtask ? B.longTasks : null,
			events: B.supported.event ? B.events : null,
			resources: performance.getEntriesByType('resource').map((e) => ({
				name: e.name,
				initiatorType: e.initiatorType,
				startTime: e.startTime,
				requestStart: e.requestStart,
				responseEnd: e.responseEnd,
				transferSize: e.transferSize,
				encodedBodySize: e.encodedBodySize,
				decodedBodySize: e.decodedBodySize,
			})),
			navigation: nav
				? { responseStart: nav.responseStart, transferSize: nav.transferSize, encodedBodySize: nav.encodedBodySize, decodedBodySize: nav.decodedBodySize, type: nav.type }
				: null,
			preloadHintsInDom: [...document.querySelectorAll('link[rel="modulepreload"], link[rel="preload"]')].map((l) => ({ rel: l.rel, href: l.href, as: l.getAttribute('as') })),
			meta: {
				entrant: document.querySelector('meta[name="benchmark:entrant"]')?.content ?? null,
				build: document.querySelector('meta[name="benchmark:build"]')?.content ?? null,
			},
			serviceWorkerController: navigator.serviceWorker?.controller?.scriptURL ?? null,
		};
	};
	B.allSnapshots = () => {
		const list = store.get('__bench_docs', []);
		list[B.documentIndex] = { ...list[B.documentIndex], snapshot: B.snapshot() };
		return list;
	};
	addEventListener('pagehide', () => {
		const list = store.get('__bench_docs', []);
		if (list[B.documentIndex]) list[B.documentIndex].snapshot = B.snapshot();
		store.set('__bench_docs', list);
	});
}

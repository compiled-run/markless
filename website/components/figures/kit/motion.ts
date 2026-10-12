const STILLNESS = '(prefers-reduced-motion: reduce)';
const MARGIN = '120px 0px';
const LONGEST_FRAME = 1 / 30;

export const asksForStillness = (): boolean =>
	typeof window !== 'undefined' && window.matchMedia(STILLNESS).matches;

export function watchStillness(changed: (still: boolean) => void): () => void {
	const query = window.matchMedia(STILLNESS);
	const listener = () => changed(query.matches);
	query.addEventListener('change', listener);
	return () => query.removeEventListener('change', listener);
}

export function watchInView(
	element: Element,
	changed: (inView: boolean) => void,
	margin = MARGIN,
): () => void {
	const observer = new IntersectionObserver(
		(entries) => changed(Boolean(entries.at(-1)?.isIntersecting)),
		{ rootMargin: margin },
	);
	observer.observe(element);
	return () => observer.disconnect();
}

export type Tick = (dt: number, calm: boolean) => boolean;

export interface Loop {
	kick(): void;
	stop(): void;
}

export function loop(tick: Tick): Loop {
	let frame = 0;
	let last = 0;
	const step = (now: number) => {
		const dt = last ? Math.min((now - last) / 1000, LONGEST_FRAME) : 1 / 60;
		last = now;
		frame = tick(dt, asksForStillness()) ? requestAnimationFrame(step) : 0;
	};
	return {
		kick() {
			if (frame) return;
			last = 0;
			frame = requestAnimationFrame(step);
		},
		stop() {
			cancelAnimationFrame(frame);
			frame = 0;
		},
	};
}

export function inViewLoop(element: Element, tick: Tick): Loop & { dispose(): void } {
	const inner = loop(tick);
	let inView = false;
	const unwatch = watchInView(element, (now) => {
		inView = now;
		if (now) inner.kick();
		else inner.stop();
	});
	return {
		kick: () => {
			if (inView) inner.kick();
		},
		stop: inner.stop,
		dispose() {
			inner.stop();
			unwatch();
		},
	};
}

export function follow(
	current: number,
	target: number,
	dt: number,
	seconds: number,
	calm = false,
): number {
	if (calm) return target;
	const next = current + (target - current) * (1 - Math.exp(-dt / seconds));
	return Math.abs(target - next) < 1e-3 ? target : next;
}

export interface Spring {
	at: number;
	rate: number;
}

export function spring(
	state: Spring,
	target: number,
	dt: number,
	stiffness: number,
	damping: number,
	calm = false,
): boolean {
	const drag = calm ? 2 * Math.sqrt(stiffness) : damping;
	const steps = Math.max(Math.ceil(dt * 240), 1);
	const slice = dt / steps;
	for (let step = 0; step < steps; step++) {
		state.rate += (target - state.at) * stiffness * slice - state.rate * drag * slice;
		state.at += state.rate * slice;
	}
	if (Math.abs(target - state.at) < 5e-4 && Math.abs(state.rate) < 5e-4) {
		state.at = target;
		state.rate = 0;
	}
	return state.at === target && state.rate === 0;
}

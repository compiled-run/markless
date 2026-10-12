// Moves the pop-up book along its story: blends each piece's precomputed matrices and writes them; the browser never projects anything.
import { KEYS, MOVE_MS, REST_MS } from './model.ts';

interface Piece {
	el: SVGElement;
	keys: number[][];
}
const pieces = new WeakMap<Element, Piece[]>();
const running = new WeakMap<Element, number>();

const hostOf = (from: Element) => from.closest('figure') as HTMLElement;
const calm = (k: number) => 0.5 - Math.cos(Math.PI * k) / 2;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function piecesOf(host: Element) {
	let found = pieces.get(host);
	if (!found) {
		found = [...host.querySelectorAll<SVGElement>('[data-keys]')].map((el) => ({ el, keys: el.getAttribute('data-keys')!.split('|').map((k) => k.split(' ').map(Number)) }));
		pieces.set(host, found);
	}
	return found;
}

function apply(host: HTMLElement, p: number) {
	let i = 0;
	while (i < KEYS.length - 2 && p > KEYS[i + 1]!) i++;
	const t = Math.min(1, Math.max(0, (p - KEYS[i]!) / (KEYS[i + 1]! - KEYS[i]!)));
	for (const { el, keys } of piecesOf(host)) {
		const a = keys[i]!;
		const b = keys[i + 1]!;
		const m = a.map((v, j) => v + (b[j]! - v) * t);
		el.setAttribute('transform', 'matrix(' + m.slice(0, 6).map((v) => v.toFixed(3)).join(' ') + ')');
		el.style.opacity = m[6]!.toFixed(3);
	}
	host.style.setProperty('--p', p.toFixed(4));
	host.dataset.p = String(p);
}

/** Stops whatever the figure holding `from` is playing. */
export function stop(from: Element) {
	cancelAnimationFrame(running.get(hostOf(from)) ?? 0);
}

/** Puts the figure holding `from` straight at story position `p`. */
export function show(from: Element, p: number) {
	stop(from);
	apply(hostOf(from), p);
}

/** Runs `legs` (each a span in milliseconds and a story position it moves to, or rests at), reporting every frame's position to `frame`, then calls `done`. */
function animate(host: HTMLElement, legs: { ms: number; to: number }[], frame: (p: number) => void, done?: () => void) {
	cancelAnimationFrame(running.get(host) ?? 0);
	let leg = 0;
	let from = Number(host.dataset.p ?? 0);
	let t0 = performance.now();
	const tick = (now: number) => {
		const current = legs[leg];
		if (!current) return done?.();
		const k = Math.min(1, (now - t0) / current.ms);
		const p = from + (current.to - from) * calm(k);
		apply(host, p);
		frame(p);
		if (k >= 1) {
			from = current.to;
			t0 = now;
			leg++;
		}
		running.set(host, requestAnimationFrame(tick));
	};
	running.set(host, requestAnimationFrame(tick));
}

/** Moves the figure holding `from` to story position `target`, reporting each frame to `frame`; with reduced motion it jumps there. */
export function goTo(from: Element, target: number, frame: (p: number) => void) {
	const host = hostOf(from);
	const start = Number(host.dataset.p ?? 0);
	if (reduced() || start === target) {
		show(from, target);
		return frame(target);
	}
	animate(host, [{ ms: 650 + 230 * Math.max(0, Math.abs(target - start) - 1), to: target }], frame);
}

/** The moves left in the story from position `p`: each stop-to-stop move at its own calm pace (a part-done move takes its share), a short rest at each stop, and a longer pause first when starting from the top. */
export function legsFrom(p: number) {
	const legs: { ms: number; to: number }[] = p <= 0 ? [{ ms: REST_MS * 2, to: 0 }] : [];
	MOVE_MS.forEach((ms, i) => {
		const left = i + 1 - Math.max(p, i);
		if (left <= 0) return;
		legs.push({ ms: ms * left, to: i + 1 });
		if (i < MOVE_MS.length - 1) legs.push({ ms: REST_MS, to: i + 1 });
	});
	return legs;
}

/** Plays the story on from where the figure holding `from` stands (from the top when it stands at the end), reporting each frame to `frame` and calling `done` at the end; with reduced motion it jumps to the end. */
export function play(from: Element, frame: (p: number) => void, done: () => void) {
	const host = hostOf(from);
	const end = MOVE_MS.length;
	if (reduced()) {
		show(from, end);
		frame(end);
		return done();
	}
	let p = Number(host.dataset.p ?? 0);
	if (p >= end - 1e-6) {
		p = 0;
		apply(host, 0);
		frame(0);
	}
	animate(host, legsFrom(p), frame, done);
}

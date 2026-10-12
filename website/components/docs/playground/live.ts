// A <Code> block's opt-in extras: marks over the text an update rewrites, and the self-ticking "Try this" steps.
import { type Rewrite, markBox, rewroteTogether, rewrittenNodes, showsText, sourceHas } from './checklist.ts';

const MARK_MS = 650;
const OBSERVED: MutationObserverInit = {
	subtree: true,
	childList: true,
	characterData: true,
	characterDataOldValue: true,
	attributes: true,
	attributeOldValue: true,
};
const booted = new WeakSet<HTMLElement>();

/** Starts the extras for one block; the session must already have put its result frame in. */
export function bootLive(box: HTMLElement): void {
	if (booted.has(box)) return;
	booted.add(box);
	const layer = box.querySelector<HTMLElement>('[data-code-updates]');
	const mark = layer?.querySelector<HTMLElement>('[data-code-update-mark]');
	const steps = [...box.querySelectorAll<HTMLElement>('[data-code-step]')];
	const said = box.querySelector<HTMLElement>('[data-code-step-said]');

	function tick(step: HTMLElement): void {
		if (step.hasAttribute('data-done')) return;
		step.setAttribute('data-done', '');
		const state = step.querySelector('[data-step-state]');
		if (state) state.textContent = 'Done: ';
		if (said) said.textContent = `Done: ${step.querySelector('[data-step-label]')?.textContent ?? ''}`;
	}

	function checkSource(): void {
		const source = [...box.querySelectorAll<HTMLTextAreaElement>('[data-code-input]')]
			.map((input) => input.value)
			.join('\n');
		for (const step of steps) {
			const code = step.dataset.stepSource;
			if (code && sourceHas(source, code)) tick(step);
		}
	}

	function checkShows(root: Element): void {
		const texts = [...root.querySelectorAll('*')].map((element) => element.textContent ?? '');
		for (const step of steps) {
			const wanted = step.dataset.stepShows;
			if (wanted && showsText(texts, wanted)) tick(step);
		}
	}

	function flash({ node, span }: Rewrite, origin: DOMRect | undefined): void {
		if (!layer || !mark) return;
		let rects: DOMRect[];
		if (node.nodeType === Node.TEXT_NODE) {
			const range = node.ownerDocument!.createRange();
			range.selectNodeContents(node);
			if (span) {
				range.setStart(node, span[0]);
				range.setEnd(node, span[1]);
			}
			rects = [...range.getClientRects()];
		} else rects = [(node as Element).getBoundingClientRect()];
		const from = layer.getBoundingClientRect();
		for (const rect of rects) {
			const box = markBox(rect, origin ?? { left: 0, top: 0 }, from);
			if (!box) continue;
			const copy = mark.cloneNode() as HTMLElement;
			copy.removeAttribute('data-code-update-mark');
			copy.hidden = false;
			Object.assign(copy.style, {
				left: `${box.left}px`,
				top: `${box.top}px`,
				width: `${box.width}px`,
				height: `${box.height}px`,
			});
			layer.append(copy);
			setTimeout(() => copy.remove(), MARK_MS);
		}
	}

	function watch(root: Element, origin: () => DOMRect | undefined): void {
		new MutationObserver((records) => {
			const rewritten = rewrittenNodes(records);
			if (layer) for (const rewrite of rewritten) flash(rewrite, origin());
			const texts = rewritten
				.filter(({ node }) => node.nodeType === Node.TEXT_NODE)
				.map(({ node, span }) => (node.nodeValue ?? '').slice(span?.[0] ?? 0, span?.[1]));
			for (const step of steps) {
				const count = Number(step.dataset.stepRewrites);
				if (count > 0 && rewroteTogether(texts, count)) tick(step);
			}
			checkShows(root);
			checkSource();
		}).observe(root, OBSERVED);
	}

	const stage = box.querySelector('[data-code-stage]');
	if (stage) watch(stage, () => undefined);
	const frame = box.querySelector<HTMLIFrameElement>('iframe.code-frame');
	if (frame) {
		// The frame is same-origin, so its result is watched from here; its offset maps rects into this page.
		const origin = () => {
			const rect = frame.getBoundingClientRect();
			return new DOMRect(rect.left + frame.clientLeft, rect.top + frame.clientTop);
		};
		const attach = () => {
			const root = frame.contentDocument?.querySelector('[data-code-frame]');
			if (root) watch(root, origin);
		};
		if (frame.contentDocument?.querySelector('[data-code-frame]')) attach();
		else frame.addEventListener('load', attach, { once: true });
	}
	box.addEventListener('input', checkSource);
	checkSource();
}

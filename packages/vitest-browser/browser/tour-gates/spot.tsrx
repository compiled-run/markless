import { element } from '@markless/core';

// The tour family reduced to the one edge it rests on: a part that never renders
// its target and never queries for it, given the consumer's own element() handle
// as a bare prop.
export function Spot({ target, label, children }) @{
	const rootEl = element<HTMLDivElement>();

	<div
		data-tg-spot
		el={rootEl}
		data-tg-render={target === undefined ? 'undefined' : 'value'}
		onClick={() => {
			const root = rootEl;
			root?.setAttribute('data-tg-probe', `${typeof target}|${typeof rootEl}|${label}`);
			const box = target?.getBoundingClientRect();
			if (!box || !root) return;
			root.setAttribute('data-tg-kind', target instanceof Element ? 'element' : typeof target);
			root.setAttribute('data-tg-tag', target.tagName);
			target.setAttribute('data-tg-seen', 'yes');
			root.style.setProperty('--x', `${Math.round(box.left)}px`);
			root.style.setProperty('--y', `${Math.round(box.top)}px`);
			root.style.setProperty('--width', `${Math.round(box.width)}px`);
			root.style.setProperty('--height', `${Math.round(box.height)}px`);
		}}
	>{children}</div>
}

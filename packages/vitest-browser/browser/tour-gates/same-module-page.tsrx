import { element } from '@markless/core';

// The same edge as the cross-module page, with the part declared in the
// consumer's OWN module: the part's destructured `target` prop and the page's
// `element:target` share a name, and each must resolve in the component that
// declared it.
function SameSpot({ target, label, children }) @{
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
			root.style.setProperty('--width', `${Math.round(box.width)}px`);
		}}
	>{children}</div>
}

export default function TourSameModulePage() @{
	const target = element<HTMLButtonElement>();

	<section data-tg-same-page>
		<button type="button" data-tg-target el={target}>Save</button>
		<button
			type="button"
			data-tg-own-probe
			onClick={() => {
				target?.setAttribute('data-tg-own-seen', typeof target);
			}}
		>own probe</button>
		<SameSpot target={target} label="save-step">measure</SameSpot>
	</section>
}

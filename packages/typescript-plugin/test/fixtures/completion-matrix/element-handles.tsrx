import { element, shared } from '@markless/core';

// The array TYPE ARGUMENT is the whole declaration of plurality, matching the
// authoring form the compiler implements in
// packages/compiler/src/passes/semantic-graph/collect-elements.ts: `optionEls`
// takes many elements because it was written `element<HTMLDivElement[]>()`, and
// `contentEl` beside it still takes exactly one because it was not.
const eh = shared(
	() => {
		const contentEl = element<HTMLDivElement>();
		const optionEls = element<HTMLDivElement[]>();

		return { contentEl, optionEls };
	},
	{ scope: 'widget' },
);

export function EhContent() @{
	const s = eh();

	<div el={s.contentEl}>content</div>
}

export function EhOption({ value }: { readonly value: string }) @{
	const s = eh();

	<div el={s.optionEls} data-value={value}>{value}</div>
}

export function EhProbe() @{
	const s = eh();

	<button
		type="button"
		onClick={() => {
			s.optionEls/*M18_PLURAL*/;
			s.contentEl/*M18_SINGULAR*/;
			const count: number = s.optionEls.length;
			const first: HTMLDivElement | undefined = s.optionEls[0];
			s.contentEl?.focus();
			void count;
			void first;
		}}
	>probe</button>
}

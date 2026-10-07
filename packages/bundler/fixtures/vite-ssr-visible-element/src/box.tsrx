function mark(items: readonly string[]) {
	return (element: HTMLElement) => {
		element.setAttribute('data-attached', String(items.length));
	};
}

export default function Box({ items }: { readonly items: readonly string[] }) @{
	<div>
		<section data-case="visible-event" onVisible={(event) => (event.target as HTMLElement).setAttribute('data-visible', 'yes')}>event</section>
		<section data-case="attach-prop" attach={mark(items)} onVisible={() => {}}>prop</section>
		<section data-case="attach-constant" attach={mark(['a', 'b'])} onVisible={() => {}}>constant</section>
		<button data-case="attach-click" attach={mark(items)} onClick={() => {}}>click</button>
	</div>
}

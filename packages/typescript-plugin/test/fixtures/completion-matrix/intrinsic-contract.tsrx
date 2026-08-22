import { element } from '@markless/core';

export function IntrinsicContract() @{
	const button = element<HTMLButtonElement>();
	const installButton = (host: HTMLButtonElement) => {
		host.disabled = false;
		return () => {};
	};
	<div
		class="accepted"
		style={{ color: 'rebeccapurple', '--panel-offset': 4 }}
		data-state="ready"
		aria-label="contract"
	>
		text {1} {null} {[<span>nested</span>]}
	</div>
	<img src="cover.jpg" alt="Cover" />
	<input value="query" type="search" />
	<a href="/library">Library</a>
	<button
		el={button}
		attach={installButton}
		onClick={(event) => {
			const nativeEvent: MouseEvent = event;
			const concreteTarget: HTMLButtonElement = event.currentTarget;
			concreteTarget.disabled = nativeEvent.clientX < 0;
		}}
	>
		Press
	</button>
	<button attach={[installButton]} onClick={(event) => event.currentTarget.focus()}>
		Array attach, single handler
	</button>
}

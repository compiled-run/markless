import { computed, state, type Children } from '@markless/core';

function Badge({ children }: { readonly children?: Children }) @{
	const spoken = computed(() => (typeof children === 'string' ? children : 'no text'));
	<div>
		<p>
			@if (children) {
				<>{children}</>
			} @else {
				<>empty</>
			}
		</p>
		<p>{`Spoken: ${spoken}`}</p>
	</div>
}

function Frame({ children }: { readonly children?: Children }) @{
	<section>
		@if (children) {
			<>{children}</>
		} @else {
			<>no frame</>
		}
	</section>
}

export default function Projected() @{
	let count = state(0);
	<main>
		<Badge>Plain words</Badge>
		<Frame><b>Bold</b> words</Frame>
		<Frame />
		<Badge />
		<button onClick={() => (count = count + 1)}>{`Pressed ${count}`}</button>
	</main>
}

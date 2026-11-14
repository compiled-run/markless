import { state } from '@markless/core';
import Forward from './forward.tsrx';
import Reader from './reader.tsrx';

export function DirectOwner() @{
	let value = state(1);
	let list = state([1]);

	<main>
		<button type="button" data-bump onClick={() => ((value = value + 1), (list = [...list, value]))}>Bump</button>
		<Reader value={value} list={list} />
	</main>
}

export function ArmOwner({ start = false }: { start?: boolean }) @{
	let open = state(start);
	let value = state(1);
	let list = state([1]);

	<main>
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		<button type="button" data-close onClick={() => (open = false)}>Close</button>
		<button type="button" data-bump onClick={() => ((value = value + 1), (list = [...list, value]))}>Bump</button>
		@if (open) {
			<Reader value={value} list={list} />
		} @else {
			<p data-closed>closed</p>
		}
	</main>
}

export function ForwardArmOwner({ start = false }: { start?: boolean }) @{
	let open = state(start);
	let value = state(1);
	let list = state([1]);

	<main>
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		<button type="button" data-close onClick={() => (open = false)}>Close</button>
		<button type="button" data-bump onClick={() => ((value = value + 1), (list = [...list, value]))}>Bump</button>
		@if (open) {
			<Forward value={value} list={list} />
		} @else {
			<p data-closed>closed</p>
		}
	</main>
}

// The arm's owner holds no value of its own: it is handed the page's.
export function PropArmOwner({ value, list, start = false }: { value: number; list: Array<number>; start?: boolean }) @{
	let open = state(start);

	<div>
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		<button type="button" data-close onClick={() => (open = false)}>Close</button>
		@if (open) {
			<Reader value={value} list={list} />
		} @else {
			<p data-closed>closed</p>
		}
	</div>
}

export function PropArmPage({ start }: { start: boolean }) @{
	let value = state(1);
	let list = state([1]);

	<main>
		<button type="button" data-bump onClick={() => ((value = value + 1), (list = [...list, value]))}>Bump</button>
		<PropArmOwner value={value} list={list} start={start} />
	</main>
}

// A second component of this file places the same owner, so its arm's reads are bound along this chain, not the first.
export function OtherPropArmPage() @{
	let count = state(1);
	let items = state([1]);

	<main>
		<button type="button" data-bump onClick={() => ((count = count + 1), (items = [...items, count]))}>Bump</button>
		<PropArmOwner value={count} list={items} />
	</main>
}

// The arm sits inside the owner's own @try.
export function TryArmOwner({ value, list }: { value: number; list: Array<number> }) @{
	let open = state(false);

	<div>
		<button type="button" data-open onClick={() => (open = true)}>Open</button>
		<button type="button" data-close onClick={() => (open = false)}>Close</button>
		@try {
			<section>
				@if (open) {
					<Reader value={value} list={list} />
				} @else {
					<p data-closed>closed</p>
				}
			</section>
		} @pending {
			<p data-closed>loading</p>
		}
	</div>
}

export function TryArmPage() @{
	let value = state(1);
	let list = state([1]);

	<main>
		<button type="button" data-bump onClick={() => ((value = value + 1), (list = [...list, value]))}>Bump</button>
		<TryArmOwner value={value} list={list} />
	</main>
}

// The arm's owner is itself placed in another owner's arm, both by components of this file.
export function NestedArmOwner({ value, list }: { value: number; list: Array<number> }) @{
	let outer = state(false);

	<section>
		<button type="button" data-open-outer onClick={() => (outer = true)}>Open outer</button>
		@if (outer) {
			<PropArmOwner value={value} list={list} />
		} @else {
			<p data-closed-outer>closed</p>
		}
	</section>
}

export function NestedArmPage() @{
	let value = state(1);
	let list = state([1]);

	<main>
		<button type="button" data-bump onClick={() => ((value = value + 1), (list = [...list, value]))}>Bump</button>
		<NestedArmOwner value={value} list={list} />
	</main>
}

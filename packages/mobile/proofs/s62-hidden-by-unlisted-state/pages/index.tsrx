import { computed, state } from '@markless/core';

export default function Items() @{
	let items = state<ReadonlyArray<string>>([]);
	let query = state('');
	const shown = computed(() => items.filter((item) => item.toLowerCase().includes(query.trim().toLowerCase())));
	<main class="page">
		<style>
			.page {
				padding: 24px;
				background: #fbf8f1;
				color: #1f1d1a;
			}
			.search {
				display: block;
				width: 100%;
				margin-bottom: 12px;
				padding: 10px 14px;
				border: 1px solid #e4ddcf;
				border-radius: 999px;
				background: #ffffff;
				font: inherit;
			}
			.list {
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.none {
				padding: 12px;
				color: #6b645a;
			}
			.add {
				display: block;
				width: 100%;
				margin-top: 12px;
				padding: 10px 16px;
				border: 0;
				border-radius: 12px;
				background: #c2410c;
				color: #ffffff;
				font: inherit;
			}
		</style>
		<input
			class="search"
			type="search"
			aria-label="Search items"
			placeholder="Search items"
			value={query}
			onInput={(event) => (query = event.currentTarget.value)}
		/>
		@if (items.length === 0) {
			<p>No items yet</p>
		} @else {
			<>
				<ul class="list">
					@for (const item of shown; key item) {
						<li>{item}</li>
					}
				</ul>
				<p class="none" hidden={shown.length > 0}>
					No items match
				</p>
			</>
		}
		<button class="add" onClick={() => (items = [...items, 'Apples'])}>
			Add item
		</button>
	</main>
}

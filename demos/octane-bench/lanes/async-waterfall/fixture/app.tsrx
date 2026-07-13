import { computed, state } from '@markless/core';
import { settleLevel } from './data.ts';

export function App() @{
	let version = state(0);
	const level0 = computed(async () => settleLevel(0, version));
	const level1 = computed(async () => settleLevel(1, level0.version));
	const level2 = computed(async () => settleLevel(2, level1.version));
	const level3 = computed(async () => settleLevel(3, level2.version));
	const level4 = computed(async () => settleLevel(4, level3.version));
	const level5 = computed(async () => settleLevel(5, level4.version));
	const level6 = computed(async () => settleLevel(6, level5.version));
	const level7 = computed(async () => settleLevel(7, level6.version));
	const level8 = computed(async () => settleLevel(8, level7.version));
	const level9 = computed(async () => settleLevel(9, level8.version));

	<main class="async-waterfall">
		<h1>Markless async waterfall</h1>
		<button id="bump" type="button" onClick={() => version = version + 1}>Update root state</button>
		<section class="level" data-level="0">@try {
			<p class="settled"><span class="value">{level0.value}</span></p>
		} @pending { <p class="pending">Pending level 0</p> } @catch { <p class="failed">Failed level 0</p> }</section>
		<section class="level" data-level="1">@try { <p class="settled"><span class="value">{level1.value}</span></p> } @pending { <p class="pending">Pending level 1</p> } @catch { <p class="failed">Failed level 1</p> }</section>
		<section class="level" data-level="2">@try { <p class="settled"><span class="value">{level2.value}</span></p> } @pending { <p class="pending">Pending level 2</p> } @catch { <p class="failed">Failed level 2</p> }</section>
		<section class="level" data-level="3">@try { <p class="settled"><span class="value">{level3.value}</span></p> } @pending { <p class="pending">Pending level 3</p> } @catch { <p class="failed">Failed level 3</p> }</section>
		<section class="level" data-level="4">@try { <p class="settled"><span class="value">{level4.value}</span></p> } @pending { <p class="pending">Pending level 4</p> } @catch { <p class="failed">Failed level 4</p> }</section>
		<section class="level" data-level="5">@try { <p class="settled"><span class="value">{level5.value}</span></p> } @pending { <p class="pending">Pending level 5</p> } @catch { <p class="failed">Failed level 5</p> }</section>
		<section class="level" data-level="6">@try { <p class="settled"><span class="value">{level6.value}</span></p> } @pending { <p class="pending">Pending level 6</p> } @catch { <p class="failed">Failed level 6</p> }</section>
		<section class="level" data-level="7">@try { <p class="settled"><span class="value">{level7.value}</span></p> } @pending { <p class="pending">Pending level 7</p> } @catch { <p class="failed">Failed level 7</p> }</section>
		<section class="level" data-level="8">@try { <p class="settled"><span class="value">{level8.value}</span></p> } @pending { <p class="pending">Pending level 8</p> } @catch { <p class="failed">Failed level 8</p> }</section>
		<section class="level" data-level="9">@try { <p class="settled deepest"><span class="value" data-deepest-value>{level9.value}</span></p> } @pending { <p class="pending">Pending level 9</p> } @catch { <p class="failed">Failed level 9</p> }</section>
	</main>
}

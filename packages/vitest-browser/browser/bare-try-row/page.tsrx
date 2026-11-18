import { state } from '@markless/core';
import { Item } from './item.tsrx';
import { Counter } from './counter.tsrx';
import { PageView } from './page-view.tsrx';
import { Flaky } from './flaky.tsrx';
import { FocusItem } from './focus-item.tsrx';
import { Retrying } from './retrying.tsrx';

export default function BareTryRowPage() @{
	let ids = state(['a', 'b', 'c']);
	let count = state(1);
	let page = state(1);
	let focusIds = state(['x', 'y']);
	let tries = state(0);
	let retryIds = state(['r1', 'r2']);
	// A fresh id per render, so one test's flaky attempt never settles another's.
	let flakyId = state(`flaky-${Math.random().toString(36).slice(2)}`);

	<main>
		<ul data-list="items">
			@for (const id of ids; key id) {
				<Item id={id} />
			}
		</ul>
		<button data-reverse onClick={() => (ids = [...ids].reverse())}>
			reverse
		</button>
		<button data-add onClick={() => (ids = [...ids, 'd'])}>
			add
		</button>
		<button data-remove onClick={() => (ids = ids.slice(0, -1))}>
			remove
		</button>

		<p data-count>{count}</p>
		@for (const value of [count]; key value) {
			<Counter seed={value} onBump={() => (count = value * 10)} />
		}

		<ul data-list="pages">
			@for (const chosen of [page]; key chosen) {
				<PageView page={chosen} />
			}
		</ul>
		<button data-prev disabled={page <= 1} onClick={() => page--}>
			prev
		</button>
		<button data-next onClick={() => page++}>
			next
		</button>

		@for (const id of [flakyId]; key id) {
			<Flaky id={id} />
		}

		<ul data-list="retrying">
			@for (const id of retryIds; key id) {
				<Retrying id={id} tries={tries} />
			}
		</ul>
		<button data-retry-all onClick={() => tries++}>
			try again
		</button>
		<button data-retry-reverse onClick={() => (retryIds = [...retryIds].reverse())}>
			reverse retrying
		</button>

		<ul data-list="focus">
			@for (const id of focusIds; key id) {
				<FocusItem id={id} />
			}
		</ul>
		<button data-add-focus onClick={() => (focusIds = [...focusIds, 'z'])}>
			add focus sibling
		</button>
	</main>
}

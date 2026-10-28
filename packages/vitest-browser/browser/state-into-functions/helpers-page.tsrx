import { state } from '@markless/core';
import { addTag, label, patchById, rename } from './people.ts';
import * as vendor from './vendor.ts';

function bump(counter: { value: number }, by: number): void {
	counter.value += by;
}

export function HelpersPage() @{
	let person = state({ first: 'Ada', last: 'L', tags: ['x'] });
	let items = state([{ id: 1, n: 0 }, { id: 2, n: 0 }]);
	let form = state({ email: ' Ada@X.io ' });
	let counter = state({ value: 1 });
	let shown = state('');

	<div>
		<output data-first>{person.first}</output>
		<output data-tags>{person.tags.join(',')}</output>
		<output data-email>{'[' + form.email + ']'}</output>
		<output data-counter>{counter.value}</output>
		<output data-shown>{shown}</output>
		<ul>
			@for (const item of items; key item.id) {
				<li data-item={item.id}>{item.n}</li>
			}
		</ul>
		<button data-rename onClick={() => rename(person, 'Cy')}>rename</button>
		<button data-rename-again onClick={() => rename(person, 'Di')}>again</button>
		<button data-tag onClick={() => addTag(person.tags, 'y')}>tag</button>
		<button data-patch onClick={() => patchById(items, 2, 7)}>patch</button>
		<button data-tidy onClick={() => vendor.tidyEmail(form)}>tidy</button>
		<button data-bump onClick={() => bump(counter, 2)}>bump</button>
		<button data-label onClick={() => { shown = label(person); }}>label</button>
	</div>
}

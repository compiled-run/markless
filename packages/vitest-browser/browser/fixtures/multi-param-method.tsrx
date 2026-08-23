import { shared, state } from '@markless/core';

// A widget family with one method per parameter shape. Every handler calls its
// method and then writes `echo`, so a handler killed inside the inlined call is
// visible as the missing second write.
export const buf = shared(() => {
	const b = state({ search: '', at: 0, echo: '', hits: 0, open: false });

	return {
		...b,
		// literal function type: a callback slot is only recognised from the written annotation
		onOpenChange: undefined as ((open: boolean) => void) | undefined,
		bump() {
			b.hits = b.hits + 1;
		},
		typedOne(text: string) {
			b.search = text;
		},
		typedTwo(text: string, at: number) {
			b.search = text;
			b.at = at;
		},
		// The parameter list carries parentheses of its own, which is the shape
		// that used to be cut in half and take the whole handler body with it.
		typedCallback(text: string, done: () => void) {
			b.search = text;
			done();
		},
		typedDefaulted(text: string, at: number = 21) {
			b.search = text;
			b.at = at;
		},
		setOpen(next: boolean) {
			if (b.open === next) return;
			b.open = next;
			b.onOpenChange?.(next);
		},
	};
}, { scope: 'widget' });

export function Root({ onOpenChange }) @{
	const b = buf();
	b.onOpenChange = onOpenChange;

	<section data-page>
		<button type="button" data-zero onClick={() => {
			b.bump();
			b.echo = 'after-zero';
		}}>zero</button>
		<button type="button" data-one onClick={() => {
			b.typedOne('one');
			b.echo = 'after-one';
		}}>one</button>
		<button type="button" data-two onClick={() => {
			b.typedTwo('two', 7);
			b.echo = 'after-two';
		}}>two</button>
		<button type="button" data-callback onClick={() => {
			b.typedCallback('callback', () => {
				b.hits = b.hits + 1;
			});
			b.echo = 'after-callback';
		}}>callback</button>
		<button type="button" data-defaulted onClick={() => {
			b.typedDefaulted('defaulted');
			b.echo = 'after-defaulted';
		}}>defaulted</button>
		<button type="button" data-mixed onClick={() => {
			const now = 9;
			const search = 'mix';
			b.typedTwo(search, now);
			b.setOpen(true);
			b.echo = 'after-mixed';
		}}>mixed</button>
		<p data-search>{b.search}</p>
		<p data-at>{b.at}</p>
		<p data-echo>{b.echo}</p>
		<p data-hits>{b.hits}</p>
		<p data-open>{b.open === true ? 'open' : 'shut'}</p>
	</section>
}

export default function MultiParamPage() @{
	<div data-host>
		<Root onOpenChange={() => {}} />
	</div>
}

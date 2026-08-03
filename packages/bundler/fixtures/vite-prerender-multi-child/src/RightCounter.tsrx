import { CounterLabel } from './CounterLabel.tsrx';

export function RightCounter({ value, onIncrement }) @{
	<section data-right-child>
		<CounterLabel side="right" value={value} />
		<button data-right-increment onClick={onIncrement}>right +2</button>
	</section>
}

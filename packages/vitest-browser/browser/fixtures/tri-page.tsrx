import { Counter, Root, Trigger } from './tri.tsrx';

export default function TriPage() @{
	<section data-tri-page>
		<div data-widget="a">
			<Root checked="mixed" blocked={true}>
				<Trigger />
				<Counter />
			</Root>
		</div>
		<div data-widget="b">
			<Root>
				<Trigger />
				<Counter />
			</Root>
		</div>
	</section>
}

import * as cb from './cbranch/index.ts';

export default function CbranchPage() @{
	<section data-cb-page>
		<div data-widget="self">
			<cb.root value={40}>
				<cb.valuelabel />
				<cb.staticlabel />
				<cb.barelabel />
				<cb.bump />
			</cb.root>
		</div>
		<div data-widget="written">
			<cb.root value={7}>
				<cb.valuelabel>custom</cb.valuelabel>
				<cb.staticlabel>written</cb.staticlabel>
				<cb.barelabel>bare</cb.barelabel>
			</cb.root>
		</div>
	</section>
}

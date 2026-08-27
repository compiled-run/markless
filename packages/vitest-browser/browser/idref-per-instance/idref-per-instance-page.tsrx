import { Panel, Widget } from './idref-per-instance.tsrx';

// Three instances of one family. One binds the panel handle, two never do.
export default function IdrefPerInstancePage() @{
	<section data-page>
		<Widget label="bound">
			<Panel>panel text</Panel>
		</Widget>
		<Widget label="bare-one">plain command</Widget>
		<Widget label="bare-two">another plain command</Widget>
	</section>
}

import { WideControls, WideReadout, WideRoot } from './wide-family.tsrx';

export default function ObjectCellWriteWidePage() @{
	<section data-ocww-page>
		<WideRoot>
			<WideReadout />
			<WideControls />
		</WideRoot>
	</section>
}

import { colorpicker } from '../../index.ts';

const AREA = 'width: 200px; height: 160px';
const PALETTE = ['#3399FF', '#FF3366', '#33CC66'];

// One embed's worth of page, mounted twice as two separate islands by the
// multi-embed battery. The swatches are written out rather than repeated over
// `colorpicker.state().swatches`: a consumer component that reads the family's
// state is a second call site of the widget's shared cell, and the battery counts
// one definition per embed. A swatch is a real button, so the value change the
// battery's click makes owes nothing to where a pointer fell.
export default function MultiEmbed() @{
	<section data-testid="frame">
		<colorpicker.root value="#3399ff" swatches={PALETTE} data-testid="root">
			<colorpicker.label data-testid="label">Brand colour</colorpicker.label>
			<colorpicker.content data-testid="content">
				<colorpicker.area data-testid="area" style={AREA}>
					<colorpicker.thumb data-testid="area-thumb" />
				</colorpicker.area>
			</colorpicker.content>
			<div data-testid="palette">
				<colorpicker.item value="#3399FF" data-testid="swatch-blue" />
				<colorpicker.item value="#FF3366" data-testid="swatch-pink" />
				<colorpicker.item value="#33CC66" data-testid="swatch-green" />
			</div>
			<colorpicker.valuelabel data-testid="valuelabel" />
		</colorpicker.root>
	</section>
}

import Illustration from '../../docs/illustration.tsrx';
import PreviewCard, { Controls, Mono, Stage, Watch } from '../../docs/preview-card.tsrx';
import Code from '../../docs/preview-card/code.tsrx';
import { namePicker } from './code-panes.ts';
import NamePicker from './name-picker.tsrx';

export default function NamePickerDemo() @{
	<PreviewCard name="name-picker" label="Callback props">
		<Controls title="A child calls its parent back" />
		<Stage>
			<div class="pin">
				<NamePicker />
				<Illustration name="name-tag" size="3.4rem" spot="corner" />
			</div>
		</Stage>
		<Watch>
			The click runs in a child <Mono>Picker</Mono>. It calls <Mono>onPick(name)</Mono>, and the
			parent's <Mono>picked</Mono> changes the text.
		</Watch>
		<Code files={namePicker} />
		<style>
			.pin {
				position: relative;
				display: grid;
				justify-items: center;
				width: min(31rem, 100%);
			}
		</style>
	</PreviewCard>
}

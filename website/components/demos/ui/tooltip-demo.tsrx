import Preview from '../../ui/preview.tsrx';
import Save from './tooltip-save.tsrx';

export default function TooltipDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Save />
	</Preview>
}

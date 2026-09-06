import Preview from '../../ui/preview.tsrx';
import Mention from './hovercard-mention.tsrx';

export default function HovercardDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Mention />
	</Preview>
}

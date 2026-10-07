import Preview from '../../../ui/preview.tsrx';
import Username from './username.tsrx';

export default function TextboxDemo({ shows }: { readonly shows: string }) @{
	<Preview shows={shows}>
		<Username />
	</Preview>
}

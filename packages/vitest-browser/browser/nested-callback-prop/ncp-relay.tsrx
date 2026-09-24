import { Picker } from './ncp-picker.tsrx';
import { Tap } from './ncp-tap.tsrx';

export function Relay({ onPick, onTap }: { readonly onPick: (mark: string) => void; readonly onTap: () => void }) @{
	<div class="relay">
		<Picker label="forwarded" onPick={onPick} />
		<Tap label="forwarded-direct" onTap={onTap} />
	</div>
}

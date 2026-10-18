import { state } from '@markless/core';
import { Moon, Sun } from './acp-icons.tsrx';

function Badge({ tone, note }: { readonly tone: string; readonly note: string }) @{
	<em data-badge class={tone} title={note}>badge</em>
}

export default function ArmConstantProps() @{
	let dark = state(false);
	let tone = state('calm');
	<section>
		<button type="button" data-theme onClick={() => (dark = !dark)}>
			@if (dark) {
				<Moon size={15} hidden={true} />
			} @else {
				<Sun size={13} label={'light "on"'} />
			}
		</button>
		<button type="button" data-tone onClick={() => (tone = tone === 'calm' ? 'loud' : 'calm')}>tone</button>
		<p data-local>
			@if (dark) {
				<Badge tone={tone} note="night" />
			} @else {
				<span>day</span>
			}
		</p>
	</section>
}

import type { PropsOf } from '@markless/core';
import { state } from '@markless/core';
import { Btn } from './btn.tsrx';
import PressButton from './press-button.tsrx';

function Knob({ children, ...rest }: PropsOf<'button'>) @{
	<button {...rest} type="button">{children}</button>
}

function Relay({ to, onPress }: { readonly to: string; readonly onPress?: () => void }) @{
	<Btn data-relay={to} onClick={onPress}>{to}</Btn>
}

function Turn({ to, onPress }: { readonly to: string; readonly onPress?: () => void }) @{
	<Knob data-turn={to} onClick={onPress}>{to}</Knob>
}

function Pass({ to, onPress }: { readonly to: string; readonly onPress?: () => void }) @{
	<span data-pass={to}>
		<PressButton onClick={onPress}>{to}</PressButton>
	</span>
}

export default function HandedDirect() @{
	const page = state({ last: '' });
	<section>
		<Relay to="none" />
		<Relay to="dark" onPress={() => { page.last = 'dark'; }} />
		<Relay to="light" onPress={() => { page.last = 'light'; }} />
		<Turn to="idle" />
		<Turn to="left" onPress={() => { page.last = 'left'; }} />
		<Turn to="right" onPress={() => { page.last = 'right'; }} />
		<Pass to="up" onPress={() => { page.last = 'up'; }} />
		<Pass to="down" onPress={() => { page.last = 'down'; }} />
		<output data-last="">{page.last}</output>
	</section>
}

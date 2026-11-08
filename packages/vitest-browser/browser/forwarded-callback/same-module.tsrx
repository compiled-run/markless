import type { PropsOf } from '@markless/core';
import { state } from '@markless/core';

function Knob({ children, ...rest }: PropsOf<'button'>) @{
	<button {...rest} type="button">{children}</button>
}

function Choice({ to }: { readonly to: string }) @{
	const page = state({ last: '' });
	<Knob data-pick={to} onClick={() => { page.last = to; }}>{to + ' -> ' + page.last}</Knob>
}

function Choices() @{
	<div>
		<Choice to="dark" />
		<Choice to="light" />
	</div>
}

function Bare() @{
	<Knob data-plain="">bare</Knob>
}

export default function SameModule() @{
	<section>
		<Bare />
		<Choices />
	</section>
}

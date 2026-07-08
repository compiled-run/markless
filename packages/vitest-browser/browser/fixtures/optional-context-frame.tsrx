import { Card } from './card.tsrx';

// T115 regression shape: a chrome component whose context row renders only
// when the OPTIONAL `info` prop exists. The child component inside the @if
// arm reads through `info` — it must never execute when `info` is absent
// (pages without a context pass no prop at all).
export function OptionalContextFrame({ info, children }) @{
	<div data-optional-frame>
		<div data-optional-context>
			@if (info) {
				<span data-optional-owner><Card>{info.owner.name}</Card></span>
			} @else {
				<em data-optional-anonymous>no context</em>
			}
		</div>
		<main data-optional-main>{children}</main>
	</div>
}

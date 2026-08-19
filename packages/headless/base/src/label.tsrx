import type { Children, PropsOf } from '@markless/core';

type LabelProps = {
	readonly for?: PropsOf<'label'>['for'];
	readonly children?: Children;
};

// QDS also suppresses text selection on a second click. That needs a synchronous
// preventDefault policy, which a barrel-reached child module cannot carry today.
export default function Label({ for: labelFor, children }: LabelProps) @{
	<label for={labelFor}>{children}</label>
}

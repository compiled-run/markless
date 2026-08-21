import type { PropsOf } from '@markless/core';

type LabelProps = Pick<PropsOf<'label'>, 'children' | 'for'>;

// QDS also suppresses text selection on a second click. That needs a synchronous
// preventDefault policy, which a barrel-reached child module cannot carry today.
export default function Label({ for: labelFor, children }: LabelProps) @{
	<label for={labelFor}>{children}</label>
}

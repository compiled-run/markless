import type { PropsOf } from '@markless/core';

type LabelProps = Pick<PropsOf<'label'>, 'children' | 'for'>;

export default function Label({ for: labelFor, children }: LabelProps) @{
	<label for={labelFor}>{children}</label>
}

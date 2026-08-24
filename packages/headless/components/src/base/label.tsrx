import type { PropsOf } from '@markless/core';

/**
 * A plain `<label>`. It wires nothing on its own: `for` is passed straight
 * through, so the consumer decides what it names. A family that owns its own
 * control ships its own label part instead, already pointed at that control.
 */
type LabelProps = Pick<PropsOf<'label'>, 'children' | 'for'>;

export default function Label({ for: labelFor, children }: LabelProps) @{
	<label for={labelFor}>{children}</label>
}

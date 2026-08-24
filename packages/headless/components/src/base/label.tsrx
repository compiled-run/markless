import type { LabelProps } from './base-types.ts';


export default function Label({ for: labelFor, children }: LabelProps) @{
	<label for={labelFor}>{children}</label>
}

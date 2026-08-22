import { PwrLabel, PwrRoot, PwrTrigger } from './pwr.tsrx';

// A second family whose parts each render exactly one element, by COMPOSING a
// part of the pwr family. `GroupRoot` composes the pwr root and forwards its own
// children into it, so a part a consumer writes inside `<GroupRoot>` is placed —
// by composition, not by the consumer — inside that composed pwr root.
export function GroupRoot({ label, children }) @{
	<PwrRoot label={label}>{children}</PwrRoot>
}

export function GroupTrigger() @{
	<PwrTrigger />
}

export function GroupLabel({ children }) @{
	<PwrLabel>{children}</PwrLabel>
}

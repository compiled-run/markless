import { PwrLabel, PwrRoot, PwrTrigger } from './pwr.tsrx';

// The one-level-deep chain: `DeepRoot` does not compose the family root itself,
// it wraps its children in ANOTHER pure composer that does. The declared
// children-projection chain has to walk both links, or a part written inside
// `<DeepRoot>` resolves to no widget at all.
function DeepFrame({ label, children }) @{
	<PwrRoot label={label}>{children}</PwrRoot>
}

export function DeepRoot({ label, children }) @{
	<DeepFrame label={label}>{children}</DeepFrame>
}

export function DeepTrigger() @{
	<PwrTrigger />
}

export function DeepLabel({ children }) @{
	<PwrLabel>{children}</PwrLabel>
}

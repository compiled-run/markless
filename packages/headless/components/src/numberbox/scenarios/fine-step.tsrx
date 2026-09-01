import { numberbox } from '../../index.ts';

// A tenth is not representable in binary, so this is the field that would show
// 0.30000000000000004 if a step ever carried its own error forward.
export default function FineStep() @{
	<numberbox.root value={0} min={0} max={1} step={0.1} name="fraction" data-testid="root">
		<numberbox.label data-testid="label">Fraction</numberbox.label>
		<numberbox.input data-testid="input" />
		<numberbox.field data-testid="field" />
	</numberbox.root>
}

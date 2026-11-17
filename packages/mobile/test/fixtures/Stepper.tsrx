export function Stepper({ label, value, onStep }: { label: string; value: number; onStep: () => void }) @{
	<section>
		<p>{label} {value}</p>
		<button onClick={() => onStep()}>Add one {label}</button>
	</section>
}

/**
 * Props for the documented panel.
 */
export type DocumentedProps = {
	/** Heading rendered at the top of the panel. */
	heading: string;
};

/**
 * A panel whose authored documentation must survive the type-service lowering.
 */
export default function DocumentedPanel({ heading }: DocumentedProps) @{
	<section>
		<h2>{heading}</h2>
	</section>
}

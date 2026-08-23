import { state } from '@markless/core';
import { NkfItem, NkfRoot } from './nested-callback-family.tsrx';
import { WcbLabel, WcbRoot, WcbTrigger } from './wcb.tsrx';

// U152 / defect 18. `wcb.tsrx` is a widget family whose root parks the
// consumer's `onChange` on the widget's own shared instance, and whose trigger
// fires it. `widget-callback-escape.test.ts` already pins the case where the
// trigger is a DIRECT child of the root. What this page adds is depth: the same
// trigger written one - and then two - component levels below the root's direct
// children, which is where the consumer's callback was measured to reach nobody
// while the widget's own write still landed.
//
// Two kinds of intermediate, because pagination's `item` is both at once: a
// plain component that only projects `children`, and a real part of the same
// family (`WcbLabel`) that reads the widget instance and projects children.
//
// `nested` is the case the fix must NOT break: two roots of the same family,
// one inside the other, which is a tree family's ordinary shape. Each root opens
// its own widget instance, so the trigger belongs to the inner one; its dispatch
// has to reach the inner root's handler and leave the outer root at zero.
//
// `keydown` is defect 20: `NkfItem` takes an optional event prop out of a rest
// spread and calls it guarded, which is the signature every headless part uses.
function Nest({ children, ...rest }) @{
	<div {...rest} data-nest>{children}</div>
}

export default function NestedCallbackPage() @{
	const log = state({ flat: 0, one: 0, two: 0, family: 0, nested: 0, outer: 0, keydown: 0 });

	<main>
		<section data-case="flat">
			<WcbRoot
				label="flat"
				onChange={() => {
					log.flat = log.flat + 1;
				}}
			>
				<WcbTrigger />
			</WcbRoot>
		</section>

		<section data-case="one">
			<WcbRoot
				label="one"
				onChange={() => {
					log.one = log.one + 1;
				}}
			>
				<Nest data-depth="1"><WcbTrigger /></Nest>
			</WcbRoot>
		</section>

		<section data-case="two">
			<WcbRoot
				label="two"
				onChange={() => {
					log.two = log.two + 1;
				}}
			>
				<Nest data-depth="1">
					<Nest data-depth="2"><WcbTrigger /></Nest>
				</Nest>
			</WcbRoot>
		</section>

		<section data-case="family">
			<WcbRoot
				label="family"
				onChange={() => {
					log.family = log.family + 1;
				}}
			>
				<WcbLabel><WcbTrigger /></WcbLabel>
			</WcbRoot>
		</section>

		<section data-case="nested">
			<WcbRoot
				label="outer"
				onChange={() => {
					log.outer = log.outer + 1;
				}}
			>
				<WcbRoot
					label="inner"
					onChange={() => {
						log.nested = log.nested + 1;
					}}
				>
					<WcbTrigger />
				</WcbRoot>
			</WcbRoot>
		</section>

		<section data-case="keydown">
			<NkfRoot label="keys">
				<NkfItem
					data-nkf-consumer
					onKeyDown={() => {
						log.keydown = log.keydown + 1;
					}}
				/>
			</NkfRoot>
		</section>

		<output data-log="flat">{log.flat}</output>
		<output data-log="one">{log.one}</output>
		<output data-log="two">{log.two}</output>
		<output data-log="family">{log.family}</output>
		<output data-log="nested">{log.nested}</output>
		<output data-log="outer">{log.outer}</output>
		<output data-log="keydown">{log.keydown}</output>
	</main>
}

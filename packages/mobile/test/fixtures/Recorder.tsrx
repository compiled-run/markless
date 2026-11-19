import { state } from '@markless/core';

// The recorder page of conformance/recorded/ (recorder.html): html is <main>, body is <section>, each band an element of
// the same name, every pointer event logged once, by the element it targets, as `<type>:<element>><relatedTarget's node id>`.
export default function Recorder() @{
	let log = state('');
	<main
				onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:html>' + event.relatedTarget;
				}}
				onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:html>' + event.relatedTarget;
				}}
				onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:html>' + event.relatedTarget;
				}}
				onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:html>' + event.relatedTarget;
				}}
				onPointerdown={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerdown:html>' + event.relatedTarget;
				}}
				onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:html>' + event.relatedTarget;
				}}
				onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:html>' + event.relatedTarget;
				}}
				onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:html>' + event.relatedTarget;
				}}
	>
		<p>{log}</p>
		<section
				onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:body>' + event.relatedTarget;
				}}
				onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:body>' + event.relatedTarget;
				}}
				onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:body>' + event.relatedTarget;
				}}
				onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:body>' + event.relatedTarget;
				}}
				onPointerdown={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerdown:body>' + event.relatedTarget;
				}}
				onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:body>' + event.relatedTarget;
				}}
				onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:body>' + event.relatedTarget;
				}}
				onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:body>' + event.relatedTarget;
				}}
		>
			<button
				onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:tap>' + event.relatedTarget;
				}}
				onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:tap>' + event.relatedTarget;
				}}
				onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:tap>' + event.relatedTarget;
				}}
				onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:tap>' + event.relatedTarget;
				}}
				onPointerdown={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerdown:tap>' + event.relatedTarget;
				}}
				onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:tap>' + event.relatedTarget;
				}}
				onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:tap>' + event.relatedTarget;
				}}
				onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:tap>' + event.relatedTarget;
				}}
			>
				tap
			</button>
			<button
				onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:other>' + event.relatedTarget;
				}}
				onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:other>' + event.relatedTarget;
				}}
				onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:other>' + event.relatedTarget;
				}}
				onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:other>' + event.relatedTarget;
				}}
				onPointerdown={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerdown:other>' + event.relatedTarget;
				}}
				onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:other>' + event.relatedTarget;
				}}
				onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:other>' + event.relatedTarget;
				}}
				onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:other>' + event.relatedTarget;
				}}
			>
				other
			</button>
			<div
				onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:drag>' + event.relatedTarget;
				}}
				onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:drag>' + event.relatedTarget;
				}}
				onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:drag>' + event.relatedTarget;
				}}
				onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:drag>' + event.relatedTarget;
				}}
				onPointerdown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					if (event.target === event.currentTarget) log = log + ' pointerdown:drag>' + event.relatedTarget;
				}}
				onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:drag>' + event.relatedTarget;
				}}
				onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:drag>' + event.relatedTarget;
				}}
				onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:drag>' + event.relatedTarget;
				}}
			>
				drag
			</div>
			<div
				onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:release>' + event.relatedTarget;
				}}
				onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:release>' + event.relatedTarget;
				}}
				onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:release>' + event.relatedTarget;
				}}
				onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:release>' + event.relatedTarget;
				}}
				onPointerdown={(event) => {
					event.currentTarget.releasePointerCapture(event.pointerId);
					if (event.target === event.currentTarget) log = log + ' pointerdown:release>' + event.relatedTarget;
				}}
				onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:release>' + event.relatedTarget;
				}}
				onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:release>' + event.relatedTarget;
				}}
				onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:release>' + event.relatedTarget;
				}}
			>
				release
			</div>
			<div
				onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:parent>' + event.relatedTarget;
				}}
				onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:parent>' + event.relatedTarget;
				}}
				onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:parent>' + event.relatedTarget;
				}}
				onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:parent>' + event.relatedTarget;
				}}
				onPointerdown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					if (event.target === event.currentTarget) log = log + ' pointerdown:parent>' + event.relatedTarget;
				}}
				onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:parent>' + event.relatedTarget;
				}}
				onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:parent>' + event.relatedTarget;
				}}
				onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:parent>' + event.relatedTarget;
				}}
			>
				<div
					onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:child>' + event.relatedTarget;
				}}
					onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:child>' + event.relatedTarget;
				}}
					onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:child>' + event.relatedTarget;
				}}
					onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:child>' + event.relatedTarget;
				}}
					onPointerdown={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerdown:child>' + event.relatedTarget;
				}}
					onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:child>' + event.relatedTarget;
				}}
					onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:child>' + event.relatedTarget;
				}}
					onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:child>' + event.relatedTarget;
				}}
				>
					child
				</div>
			</div>
			<div
				onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:scroll>' + event.relatedTarget;
				}}
				onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:scroll>' + event.relatedTarget;
				}}
				onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:scroll>' + event.relatedTarget;
				}}
				onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:scroll>' + event.relatedTarget;
				}}
				onPointerdown={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerdown:scroll>' + event.relatedTarget;
				}}
				onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:scroll>' + event.relatedTarget;
				}}
				onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:scroll>' + event.relatedTarget;
				}}
				onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:scroll>' + event.relatedTarget;
				}}
			>
				<div
					onPointerover={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerover:scrollInner>' + event.relatedTarget;
				}}
					onPointerout={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerout:scrollInner>' + event.relatedTarget;
				}}
					onPointerenter={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerenter:scrollInner>' + event.relatedTarget;
				}}
					onPointerleave={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerleave:scrollInner>' + event.relatedTarget;
				}}
					onPointerdown={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerdown:scrollInner>' + event.relatedTarget;
				}}
					onPointermove={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointermove:scrollInner>' + event.relatedTarget;
				}}
					onPointerup={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointerup:scrollInner>' + event.relatedTarget;
				}}
					onPointercancel={(event) => {
					if (event.target === event.currentTarget) log = log + ' pointercancel:scrollInner>' + event.relatedTarget;
				}}
				>
					scroll
				</div>
			</div>
		</section>
	</main>
}

import { state } from '@markless/core';

export default function Touch() @{
	let log = state('');
	<main
		onPointerenter={() => (log = log + ' enter:main')}
		onPointerleave={() => (log = log + ' leave:main')}
	>
		<p>{log}</p>
		<div
			onPointerover={(event) => (log = log + ' over:pad/' + (event.relatedTarget === null ? 'none' : 'some'))}
			onPointerout={(event) => (log = log + ' out:pad/' + (event.relatedTarget === null ? 'none' : 'some'))}
			onPointerenter={() => (log = log + ' enter:pad')}
			onPointerleave={() => (log = log + ' leave:pad')}
			onPointerdown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				log =
					log +
					' down:pad/' +
					event.pointerType +
					'/' +
					event.pointerId +
					'/' +
					event.button +
					'/' +
					event.buttons +
					'/' +
					event.clientX +
					',' +
					event.clientY +
					'/' +
					event.isPrimary +
					'/' +
					event.timeStamp;
			}}
			onPointermove={(event) => (log = log + ' move:pad/' + event.button + '/' + event.buttons + '/' + event.clientX)}
			onPointerup={(event) => (log = log + ' up:pad/' + event.button + '/' + event.buttons)}
			onPointercancel={(event) => (log = log + ' cancel:pad/' + event.clientX + ',' + event.clientY)}
		>
			<p onPointerover={() => (log = log + ' over:knob')} onPointerout={() => (log = log + ' out:knob')}>
				Knob
			</p>
		</div>
		<div
			onPointerover={() => (log = log + ' over:other')}
			onPointerout={() => (log = log + ' out:other')}
			onPointerenter={() => (log = log + ' enter:other')}
			onPointerleave={() => (log = log + ' leave:other')}
			onPointermove={() => (log = log + ' move:other')}
			onPointerup={() => (log = log + ' up:other')}
			onPointercancel={() => (log = log + ' cancel:other')}
		>
			Other
		</div>
		<div
			onPointerdown={(event) => {
				event.currentTarget.releasePointerCapture(event.pointerId);
				log = log + ' down:free/' + (event.currentTarget.hasPointerCapture(event.pointerId) ? 'held' : 'released');
			}}
		>
			Free
		</div>
	</main>
}

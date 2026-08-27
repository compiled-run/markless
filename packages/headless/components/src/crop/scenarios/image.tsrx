import { element, state } from '@markless/core';
import * as crop from '../index.ts';

const AREA = 'position: relative; width: 400px; height: 300px';
const PICTURE = 'display: block; width: 400px; height: 300px; object-fit: fill';
const HANDLE = 'width: 12px; height: 12px; background: #111';
const START = { x: 40, y: 30, width: 200, height: 150 };

// An 800×600 picture shown at 400×300, so the scale from area pixels to the
// picture's own pixels is exactly 2.
const SOURCE =
	'data:image/svg+xml;charset=utf-8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
			'<rect width="800" height="600" fill="#4a6"/>' +
			'<rect x="200" y="150" width="400" height="300" fill="#136"/>' +
			'</svg>',
	);

/**
 * The image recipe. The family knows nothing about bitmaps: it reports a
 * rectangle in area pixels, and this is the nine lines of consumer code that turn
 * that into the picture's own pixels and cut it out with a canvas.
 */
export default function Image() @{
	const picture = element<HTMLImageElement>();
	const sheet = element<HTMLCanvasElement>();
	let cut = state('');

	<main>
		<crop.root
			data-testid="root"
			name="crop"
			defaultValue={START}
			onChange={(rect) => {
				const shown = picture;
				const board = sheet;
				if (!shown || !board) return;

				const scale = shown.naturalWidth / shown.clientWidth;
				const x = Math.round(rect.x * scale);
				const y = Math.round(rect.y * scale);
				const width = Math.round(rect.width * scale);
				const height = Math.round(rect.height * scale);
				board.setAttribute('width', String(width));
				board.setAttribute('height', String(height));
				board.getContext('2d')?.drawImage(shown, x, y, width, height, 0, 0, width, height);
				cut = `${x},${y},${width},${height}`;
			}}
		>
			<crop.label data-testid="label">Photo</crop.label>
			<crop.area data-testid="area" style={AREA}>
				<img data-testid="picture" el={picture} src={SOURCE} alt="" style={PICTURE} />
				<crop.selection data-testid="selection">
					<crop.thumb data-testid="handle-bottom-end" blockEnd inlineEnd style={HANDLE} />
				</crop.selection>
			</crop.area>
			<crop.field data-testid="field" />
		</crop.root>
		<canvas data-testid="canvas" el={sheet} />
		<output data-testid="cut">{cut}</output>
	</main>
}

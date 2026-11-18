export default function Clip() @{
	<div data-page="clip">
		<a href="/media" data-go="media">Media</a>
		<video muted src="/tone.wav?clip" data-media="video-src"></video>
		<video muted data-media="video-source"><source src="/tone.wav?source-clip" type="audio/wav" /></video>
		<audio muted src="/tone.wav?audio-clip" data-media="audio-src"></audio>
		<section>
			<video muted src="/tone.wav?nested-clip" data-media="video-nested"></video>
		</section>
		<img src="/dot.png?clip" alt="" data-image="src" />
		<img srcset="/dot.png?srcset-clip 1x" alt="" data-image="srcset" />
		<picture>
			<source srcset="/dot.png?picture-clip" type="image/png" />
			<img src="/dot.png?fallback-clip" alt="" data-image="picture" />
		</picture>
		<iframe src="/frame.html?clip" title="Frame" data-frame-host></iframe>
	</div>
}

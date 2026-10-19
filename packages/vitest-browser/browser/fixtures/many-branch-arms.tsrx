import { state } from '@markless/core';

export function App() @{
	let open = state(true);
	let picked = state('none');

	<main>
		<output data-picked>{picked}</output>
		<button type="button" data-wake onClick={() => { picked = 'wake'; open = !open; open = !open; }}>Wake</button>
		<section>
			<p>Section 0 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="0" onClick={() => picked = '0'}>Pick 0</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 1 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="1" onClick={() => picked = '1'}>Pick 1</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 2 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="2" onClick={() => picked = '2'}>Pick 2</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 3 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="3" onClick={() => picked = '3'}>Pick 3</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 4 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="4" onClick={() => picked = '4'}>Pick 4</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 5 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="5" onClick={() => picked = '5'}>Pick 5</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 6 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="6" onClick={() => picked = '6'}>Pick 6</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 7 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="7" onClick={() => picked = '7'}>Pick 7</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 8 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="8" onClick={() => picked = '8'}>Pick 8</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 9 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="9" onClick={() => picked = '9'}>Pick 9</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 10 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="10" onClick={() => picked = '10'}>Pick 10</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 11 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="11" onClick={() => picked = '11'}>Pick 11</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 12 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="12" onClick={() => picked = '12'}>Pick 12</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 13 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="13" onClick={() => picked = '13'}>Pick 13</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 14 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="14" onClick={() => picked = '14'}>Pick 14</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 15 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="15" onClick={() => picked = '15'}>Pick 15</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 16 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="16" onClick={() => picked = '16'}>Pick 16</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 17 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="17" onClick={() => picked = '17'}>Pick 17</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 18 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="18" onClick={() => picked = '18'}>Pick 18</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 19 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="19" onClick={() => picked = '19'}>Pick 19</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 20 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="20" onClick={() => picked = '20'}>Pick 20</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 21 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="21" onClick={() => picked = '21'}>Pick 21</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 22 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="22" onClick={() => picked = '22'}>Pick 22</button>
			} @else {
				<span>closed</span>
			}
		</section>
		<section>
			<p>Section 23 prose that stays static.</p>
			@if (open) {
				<button type="button" data-arm="23" onClick={() => picked = '23'}>Pick 23</button>
			} @else {
				<span>closed</span>
			}
		</section>
	</main>
}

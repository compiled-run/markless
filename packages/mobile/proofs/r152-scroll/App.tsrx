import { element, state } from '@markless/core';

export default function App() @{
	let scrolled = state(false);
	let top = state(0);
	let still = state(0);
	const box = element<HTMLDivElement>();
	<main class="page">
		<style>
			.page {
				padding: 16px;
			}
			.title {
				margin: 0 0 12px;
				height: 40px;
				font-size: 24px;
			}
			.box {
				height: 300px;
				overflow-y: auto;
				border: 2px solid #1d1b16;
			}
			.item {
				margin: 0;
				padding: 0 12px;
				height: 44px;
				font-size: 18px;
			}
			.line {
				margin: 8px 0 0;
				height: 28px;
				font-size: 18px;
			}
		</style>
		<h1 class="title">Scroll events</h1>
		<p class="line">{scrolled ? 'Box scrolled' : 'Box not scrolled'}</p>
		<p class="line">{top > 100 ? 'Past the first rows' : 'At the first rows'}</p>
		<div el={box} class="box" onScroll={() => { scrolled = true; top = box.scrollTop; }}>
			<p class="item">Box row 1</p>
			<p class="item">Box row 2</p>
			<p class="item">Box row 3</p>
			<p class="item">Box row 4</p>
			<p class="item">Box row 5</p>
			<p class="item">Box row 6</p>
			<p class="item">Box row 7</p>
			<p class="item">Box row 8</p>
			<p class="item">Box row 9</p>
			<p class="item">Box row 10</p>
			<p class="item">Box row 11</p>
			<p class="item">Box row 12</p>
			<p class="item">Box row 13</p>
			<p class="item">Box row 14</p>
			<p class="item">Box row 15</p>
			<p class="item">Box row 16</p>
			<p class="item">Box row 17</p>
			<p class="item">Box row 18</p>
			<p class="item">Box row 19</p>
			<p class="item">Box row 20</p>
			<p class="item">Box row 21</p>
			<p class="item">Box row 22</p>
			<p class="item">Box row 23</p>
			<p class="item">Box row 24</p>
			<p class="item">Box row 25</p>
			<p class="item">Box row 26</p>
			<p class="item">Box row 27</p>
			<p class="item">Box row 28</p>
			<p class="item">Box row 29</p>
			<p class="item">Box row 30</p>
		</div>
		<div class="line" onScroll={() => still++}>Still box scrolled {still} times</div>
	</main>
}

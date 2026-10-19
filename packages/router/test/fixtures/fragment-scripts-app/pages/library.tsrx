import { state } from '@markless/core';

// oxlint-disable-next-line no-unused-vars -- used inside <script>{…}</script>, which tsrx lint does not see
const greet = 'window.__inlineRuns = (window.__inlineRuns || 0) + 1; __order.push("inline:" + library.greet("reader")); document.querySelector("[data-greeting]").textContent = library.greet("reader");';
// oxlint-disable-next-line no-unused-vars -- used inside <script>{…}</script>, which tsrx lint does not see
const afterLate = '__order.push("after-late:" + late());';
// oxlint-disable-next-line no-unused-vars -- used inside <script>{…}</script>, which tsrx lint does not see
const define = 'function markTapped() { document.querySelector("[data-tapped]").textContent = "tapped " + library.greet("button"); } __order.push("define");';
// oxlint-disable-next-line no-unused-vars -- used inside <script>{…}</script>, which tsrx lint does not see
const moduleInline = '__order.push("module-inline");';
// oxlint-disable-next-line no-unused-vars -- used inside <script>{…}</script>, which tsrx lint does not see
const skipped = '__order.push("must-not-run");';
// oxlint-disable-next-line no-unused-vars -- used inside <script>{…}</script>, which tsrx lint does not see
const loadEvents = 'document.addEventListener("DOMContentLoaded", function () { __order.push("DOMContentLoaded"); }); window.addEventListener("load", function () { __order.push("load"); });';

export default function LibraryPage() @{
	let taps = state(0);

	<div data-page="library">
		<h1>Library</h1>
		<a href="/" data-go="plain">Plain</a>
		<p data-greeting>not greeted</p>
		<p data-tapped>not tapped</p>
		<button type="button" onclick="markTapped()" data-onclick>Inline handler</button>
		<output data-taps>{taps}</output>
		<button type="button" data-tap onClick={() => taps++}>Tap</button>
		<script src="/shared.js"></script>
		<script>{greet}</script>
		<script src="/late.js"></script>
		<script>{afterLate}</script>
		<script>{define}</script>
		<script defer src="/deferred.js"></script>
		<script type="module">{moduleInline}</script>
		<script type="module" src="/module.js"></script>
		<script nomodule>{skipped}</script>
		<script type="text/plain">{skipped}</script>
		<script async src="/async.js"></script>
		<script>{loadEvents}</script>
	</div>
}

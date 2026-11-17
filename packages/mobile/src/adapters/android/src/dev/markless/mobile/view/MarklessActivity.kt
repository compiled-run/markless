package dev.markless.mobile.view

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import dev.markless.mobile.core.Payload

/** An Activity that shows one Markless component: override [payloadBytes], and [styleExportBytes] to apply Dragon's styles. */
abstract class MarklessActivity : Activity() {
	lateinit var host: MarklessHost
		private set

	abstract fun payloadBytes(): ByteArray

	open fun styleExportBytes(): ByteArray? = null

	/** The path the app opens at (`/apple`); the Maestro launch argument `route` arrives as this intent extra. */
	open fun route(): String? = intent.getStringExtra("route")

	/** The params of [route], matched against the payload's route pattern; no route opens a page whose pattern has no params. */
	private fun launchParams(payload: ByteArray): Map<String, String> {
		val route = Payload.decode(payload).route
		val path = route() ?: if (route == null || route.params.isEmpty()) return emptyMap() else throw MarklessHostError("launched with no route; this payload is the page at ${route.pattern}")
		if (route == null) throw MarklessHostError("launched at $path, but the payload is not a page")
		return route.match(path) ?: throw MarklessHostError("launched at $path, which does not match ${route.pattern}")
	}

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		open(launchParams(payloadBytes()))
	}

	/** Builds the page from scratch with [params]: one page per payload, so a link names this page's own route. */
	private fun open(params: Map<String, String>) {
		val bytes = payloadBytes()
		host = MarklessHost(this, bytes, styleExportBytes(), params = params)
		host.onNavigate = { route, next ->
			if (route != host.payload.route?.pattern) throw MarklessHostError("navigate to $route; this app holds only ${host.payload.route?.pattern}")
			open(next)
		}
		val viewport = object : FrameLayout(this) {
			override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
				val f = host.rootFrame
				if (f == null) super.onLayout(changed, left, top, right, bottom)
				else host.root.layout(paddingLeft + f.left, paddingTop + f.top, paddingLeft + f.right, paddingTop + f.bottom)
			}

			override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
				super.onMeasure(widthMeasureSpec, heightMeasureSpec)
				host.rootFrame?.let { host.root.measure(MeasureSpec.makeMeasureSpec(it.width(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(it.height(), MeasureSpec.EXACTLY)) }
			}
		}
		viewport.setOnApplyWindowInsetsListener { v, insets ->
			val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
			v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
			insets
		}
		viewport.addView(host.root, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
		setContentView(viewport)
		// Proof only: a build that asks for it starts the script engine once the first frame is up and the queue is idle.
		if (host.payload.script != null && assets.list("markless")?.contains("warm-engine") == true)
			android.os.Looper.myQueue().addIdleHandler { host.runtime.warmEngine(); false }
		if (host.style != null) viewport.post { android.util.Log.i(MarklessHost.TAG, "frames max gap ${host.frameDeviation()} device px") }
	}

	fun contentRoot(): View = host.root
}

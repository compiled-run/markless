package dev.markless.mobile.view

import android.app.Activity
import android.content.Intent
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

	/** Where device values come from and device calls go; the phone's own by default. */
	open val device: NativeDevice by lazy { PlatformDevice(this) }

	override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
		super.onRequestPermissionsResult(requestCode, permissions, grantResults)
		device.permissionsAnswered(requestCode)
	}

	override fun onResume() {
		super.onResume()
		device.resumed()
	}

	override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
		super.onActivityResult(requestCode, resultCode, data)
		device.activityResult(requestCode)
	}

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
		if (::host.isInitialized) host.release()
		host = MarklessHost(this, bytes, styleExportBytes(), params = params, device = device)
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
		if (host.style != null) viewport.post { android.util.Log.i(MarklessHost.TAG, "frames max gap ${host.frameDeviation()} device px") }
	}

	fun contentRoot(): View = host.root
}

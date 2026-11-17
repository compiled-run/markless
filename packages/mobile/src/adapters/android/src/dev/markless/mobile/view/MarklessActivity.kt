package dev.markless.mobile.view

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout

/** An Activity that shows one Markless component: override [payloadBytes], and [styleExportBytes] to apply Dragon's styles. */
abstract class MarklessActivity : Activity() {
	lateinit var host: MarklessHost
		private set

	abstract fun payloadBytes(): ByteArray

	open fun styleExportBytes(): ByteArray? = null

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		host = MarklessHost(this, payloadBytes(), styleExportBytes())
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

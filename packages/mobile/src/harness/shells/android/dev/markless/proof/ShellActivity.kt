package dev.markless.proof

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.TextView
import dev.markless.mobile.core.JsValue
import dev.markless.mobile.core.Json
import dev.markless.mobile.view.DeviceOutcome
import dev.markless.mobile.view.MarklessActivity
import dev.markless.mobile.view.NativeDevice
import dev.markless.mobile.view.PlatformDevice
import java.io.FileNotFoundException

/**
 * The proof build's device: the phone's own, except that it lists every call it receives in the view
 * `markless-device-calls`, and that a `markless-proof://device/<value>?value=<json>` link sets a live value.
 */
class ProofDevice(private val platform: NativeDevice, private val label: TextView) : NativeDevice {
	private val calls = ArrayList<String>()
	private val faked = HashMap<String, JsValue>()
	private val watchers = HashMap<String, MutableList<(JsValue) -> Unit>>()

	override fun read(name: String): JsValue = faked[name] ?: platform.read(name)

	override fun watch(name: String, changed: (JsValue) -> Unit) {
		watchers.getOrPut(name) { ArrayList() }.add(changed)
		platform.watch(name) { if (name !in faked) changed(it) }
	}

	override fun call(name: String, arguments: List<JsValue>, settle: ((DeviceOutcome) -> Unit)?) {
		calls.add(name)
		label.text = "calls: " + calls.joinToString(", ")
		platform.call(name, arguments, settle)
	}

	override fun permissionsAnswered(requestCode: Int) = platform.permissionsAnswered(requestCode)

	fun set(name: String, value: JsValue) {
		faked[name] = value
		for (changed in watchers[name].orEmpty()) changed(value)
	}
}

class ShellActivity : MarklessActivity() {
	private val label by lazy {
		TextView(this).apply {
			text = "calls: none"
			textSize = 12f
			setTextColor(Color.GRAY)
			accessibilityDelegate = object : View.AccessibilityDelegate() {
				override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
					super.onInitializeAccessibilityNodeInfo(host, info)
					info.viewIdResourceName = "markless-device-calls"
				}
			}
		}
	}

	override val device: ProofDevice by lazy { ProofDevice(PlatformDevice(this), label) }

	override fun payloadBytes(): ByteArray = assets.open("markless/payload.json").use { it.readBytes() }

	override fun styleExportBytes(): ByteArray? =
		try {
			assets.open("markless/style.json").use { it.readBytes() }
		} catch (_: FileNotFoundException) {
			null
		}

	override fun onCreate(savedInstanceState: Bundle?) {
		super.onCreate(savedInstanceState)
		val bottom = (32 * resources.displayMetrics.density).toInt()
		addContentView(label, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply {
			setMargins(bottom / 2, 0, 0, bottom)
		})
		open(intent)
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		open(intent)
	}

	private fun open(intent: Intent) {
		val link = intent.data ?: return
		if (link.scheme != "markless-proof" || link.host != "device") return
		val value = link.getQueryParameter("value") ?: return
		device.set(link.path.orEmpty().removePrefix("/"), JsValue.fromJson(Json.parse(value.toByteArray())))
	}
}

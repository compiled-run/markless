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
import dev.markless.mobile.view.AppScriptEngine
import dev.markless.mobile.view.DeviceOutcome
import dev.markless.mobile.view.MarklessActivity
import dev.markless.mobile.view.NativeDevice
import dev.markless.mobile.view.PlatformDevice
import java.io.FileNotFoundException

/**
 * The proof build's device: the phone's own, except that it lists every call it receives in the view
 * `markless-device-calls`, and that a `markless-proof://device/<value>?value=<json>` link sets a live value.
 */
class ProofDevice(private val platform: NativeDevice, private val label: TextView, private val cameraLabel: TextView, private val microphoneLabel: TextView) : NativeDevice {
	private val calls = ArrayList<String>()
	private val recording = HashSet<String>()

	private fun recorded(obj: String, on: Boolean) {
		if (on) recording.add(obj) else recording.remove(obj)
		microphoneLabel.text = if (recording.isEmpty()) "microphone off" else "microphone on"
	}
	private val faked = HashMap<String, JsValue>()
	private val watchers = HashMap<String, MutableList<(JsValue) -> Unit>>()

	override fun read(name: String, obj: String?): JsValue = faked[name] ?: platform.read(name, obj)

	override fun watch(name: String, obj: String?, changed: (JsValue) -> Unit) {
		watchers.getOrPut(name) { ArrayList() }.add(changed)
		platform.watch(name, obj) {
			// The emulator's camera is real: the label only reports whether its session runs.
			if (name == "camera.ready") cameraLabel.text = if (it == JsValue.Bool(true)) "camera on" else "camera off"
			// Recording is the platform's real MediaRecorder: the label reports whether one records.
			if (name == "recorder.active" && obj != null) recorded(obj, it == JsValue.Bool(true))
			if (name !in faked) changed(it)
		}
	}

	override fun call(name: String, obj: String?, arguments: List<JsValue>, settle: ((DeviceOutcome) -> Unit)?) {
		calls.add(name)
		label.text = "calls: " + calls.joinToString(", ")
		// The browser would cover the app the flow reads: the call is listed and goes no further.
		if (name == "browser.open") return settle?.invoke(DeviceOutcome.Value(JsValue.Null)) ?: Unit
		platform.call(name, obj, arguments, settle)
	}

	override fun view(obj: String, device: String): android.view.View = platform.view(obj, device)

	override fun permissionsAnswered(requestCode: Int) = platform.permissionsAnswered(requestCode)

	override fun release(obj: String) {
		platform.release(obj)
		recorded(obj, false)
	}

	override fun resumed() = platform.resumed()

	override fun activityResult(requestCode: Int) = platform.activityResult(requestCode)

	fun set(name: String, value: JsValue) {
		faked[name] = value
		for (changed in watchers[name].orEmpty()) changed(value)
	}
}

class ShellActivity : MarklessActivity() {
	private fun testLabel(id: String, initial: String) = TextView(this).apply {
		text = initial
		textSize = 12f
		setTextColor(Color.GRAY)
		accessibilityDelegate = object : View.AccessibilityDelegate() {
			override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
				super.onInitializeAccessibilityNodeInfo(host, info)
				info.viewIdResourceName = id
			}
		}
	}

	private val label by lazy { testLabel("markless-device-calls", "calls: none") }
	private val cameraLabel by lazy { testLabel("markless-camera", "camera off") }
	private val microphoneLabel by lazy { testLabel("markless-microphone", "microphone off") }
	private val engineLabel by lazy { testLabel("markless-engine-starts", "engine starts: ${AppScriptEngine.starts}") }
	private val engineStarted: (Int) -> Unit = { engineLabel.text = "engine starts: $it" }

	/** A test build can turn warming off (asset `markless/engine-warm` reads `0`) to measure a cold first entry. */
	override val warmsScriptEngine: Boolean by lazy {
		try {
			assets.open("markless/engine-warm").use { String(it.readBytes()).trim() } != "0"
		} catch (_: FileNotFoundException) {
			true
		}
	}

	override val device: ProofDevice by lazy { ProofDevice(PlatformDevice(this), label, cameraLabel, microphoneLabel) }

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
		addContentView(cameraLabel, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply {
			setMargins(bottom / 2, 0, 0, bottom * 2)
		})
		addContentView(microphoneLabel, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply {
			setMargins(bottom / 2, 0, 0, bottom * 3)
		})
		addContentView(engineLabel, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.START).apply {
			setMargins(bottom / 2, 0, 0, bottom * 4)
		})
		AppScriptEngine.onStart(engineStarted)
		open(intent)
	}

	override fun onDestroy() {
		AppScriptEngine.removeOnStart(engineStarted)
		super.onDestroy()
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

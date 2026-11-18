package dev.markless.mobile.view

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.HapticFeedbackConstants
import dev.markless.mobile.core.JsValue

/** How a device call ended: its value, or an error by name (`NotAllowedError` when the person refused). */
sealed interface DeviceOutcome {
	data class Value(val value: JsValue) : DeviceOutcome
	data class Error(val name: String, val message: String) : DeviceOutcome
}

/**
 * The device features a payload names (`@markless/serializer/native-device` lists them). Every callback runs on the main
 * thread. A host throws on a name its device does not implement, so a payload is never half run.
 */
interface NativeDevice {
	/** The live value [name] now (`network.online`), of [obj] when it is a device object's field (`camera.ready`). */
	fun read(name: String, obj: String? = null): JsValue
	/** Calls [changed] with each new value of [name] (of [obj]). */
	fun watch(name: String, obj: String? = null, changed: (JsValue) -> Unit)
	/** Runs the call [name], on [obj] when it names one; [settle], when given, receives how it ended. */
	fun call(name: String, obj: String? = null, arguments: List<JsValue>, settle: ((DeviceOutcome) -> Unit)?)
	/** The view that shows a device object (a camera's preview); it runs while attached to a window and releases after. */
	fun view(obj: String, device: String): android.view.View
	/** The activity's permission answer, forwarded by [MarklessActivity]. */
	fun permissionsAnswered(requestCode: Int) {}
	/** The device object [obj] ended (its owner left the screen, or its page was replaced). */
	fun release(obj: String) {}
	/** The activity came back to the front, forwarded by [MarklessActivity]: the person may have changed a permission in Settings. */
	fun resumed() {}
	/** An activity this device started returned, forwarded by [MarklessActivity]. */
	fun activityResult(requestCode: Int) {}
}

/** The phone's own features. */
class PlatformDevice(private val activity: Activity) : NativeDevice {
	private val main = Handler(Looper.getMainLooper())
	private val connectivity = activity.getSystemService(ConnectivityManager::class.java)
	private val watchers = HashMap<String, MutableList<(JsValue) -> Unit>>()
	private val cameras = HashMap<String, CameraObject>()
	private val recorders = HashMap<String, RecorderObject>()
	private val prefs = activity.getSharedPreferences("markless-device", Context.MODE_PRIVATE)
	private var askedCamera = prefs.getBoolean("asked-camera", false)
	private var askedRecorder = prefs.getBoolean("asked-recorder", false)
	private val waitingForMicrophone = LinkedHashSet<String>()
	private var sharing: ((DeviceOutcome) -> Unit)? = null
	/** Each access value as last read or emitted, to tell what changed while the app was away. */
	private val lastAccess = HashMap<String, String>()

	private fun key(name: String, obj: String?) = obj?.let { "$it#$name" } ?: name

	private fun emit(key: String, value: JsValue) {
		for (changed in watchers[key].orEmpty()) changed(value)
	}

	private fun camera(obj: String): CameraObject = cameras.getOrPut(obj) {
		CameraObject(activity) { field, value -> emit(key("camera.$field", obj), value) }
	}

	private fun recorder(obj: String): RecorderObject = recorders.getOrPut(obj) {
		RecorderObject(activity) { field, value -> emit(key("recorder.$field", obj), value) }
	}

	private fun recorderAccess(): String = when {
		activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED -> "granted"
		!askedRecorder -> "unknown"
		activity.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO) -> "denied"
		else -> "blocked"
	}

	private fun access(name: String): String = when (name) {
		"location.access" -> locationAccess()
		"camera.access" -> cameraAccess()
		else -> recorderAccess()
	}.also { lastAccess[name] = it }

	private fun emitAccess(name: String) = emit(name, JsValue.Str(access(name)))

	private fun cameraAccess(): String = when {
		activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED -> "granted"
		!askedCamera -> "unknown"
		activity.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) -> "denied"
		else -> "blocked"
	}

	override fun view(obj: String, device: String): android.view.View {
		if (device != "camera") throw MarklessHostError("this device has no view for a $device")
		val camera = camera(obj)
		return CameraPreview(activity) { attached, preview ->
			if (!attached) return@CameraPreview camera.hidden(preview)
			camera.shown(preview)
			if (cameraAccess() != "granted" && cameraAccess() != "blocked") {
				askedCamera = true
				prefs.edit().putBoolean("asked-camera", true).apply()
				activity.requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST)
			}
		}
	}
	private var online: Boolean? = null
	private val waitingForAccess = ArrayList<() -> Unit>()
	private var askedLocation = prefs.getBoolean("asked-location", false)

	/** Starts following connectivity on first use: only a payload that reads it declares ACCESS_NETWORK_STATE. */
	private fun networkOnline(): Boolean = online ?: run {
		val now = connectivity.activeNetwork?.let(connectivity::getNetworkCapabilities)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
		online = now
		connectivity.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
			override fun onAvailable(network: Network) = main.post { setOnline(true) }.let {}
			override fun onLost(network: Network) = main.post { setOnline(false) }.let {}
		})
		now
	}

	private fun setOnline(now: Boolean) {
		if (now == online) return
		online = now
		emit("network.online", JsValue.Bool(now))
	}

	private fun locationGranted() = LOCATION.any { activity.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

	private fun locationAccess(): String = when {
		activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED -> "granted"
		activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED -> "limited"
		!askedLocation -> "unknown"
		activity.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION) -> "denied"
		else -> "blocked"
	}

	override fun read(name: String, obj: String?): JsValue = when {
		name == "network.online" && obj == null -> JsValue.Bool(networkOnline())
		name in ACCESS && obj == null -> JsValue.Str(access(name))
		name == "camera.ready" && obj != null -> JsValue.Bool(camera(obj).ready)
		name == "camera.facing" && obj != null -> JsValue.Str(camera(obj).facing)
		name == "recorder.active" && obj != null -> JsValue.Bool(recorder(obj).active)
		name == "recorder.seconds" && obj != null -> JsValue.Num(recorder(obj).seconds.toDouble())
		name == "recorder.clip" && obj != null -> recorder(obj).clip?.let { JsValue.Str(it) } ?: JsValue.Null
		else -> throw MarklessHostError("this device has no live value $name")
	}

	override fun watch(name: String, obj: String?, changed: (JsValue) -> Unit) {
		read(name, obj)
		watchers.getOrPut(key(name, obj)) { ArrayList() }.add(changed)
	}

	override fun call(name: String, obj: String?, arguments: List<JsValue>, settle: ((DeviceOutcome) -> Unit)?) {
		if (obj != null) {
			when (name) {
				"camera.takePhoto" -> {
					val access = cameraAccess()
					if (access == "denied" || access == "blocked") settle?.invoke(CAMERA_REFUSED)
					else camera(obj).takePhoto { settle?.invoke(it) }
				}
				"camera.facing" -> camera(obj).setFacing((arguments.firstOrNull() as? JsValue.Str)?.value ?: throw MarklessHostError("camera.facing takes one string"))
				"recorder.active" -> record(obj, (arguments.firstOrNull() as? JsValue.Bool)?.value ?: throw MarklessHostError("recorder.active takes one boolean"))
				else -> throw MarklessHostError("this device has no call $name on an object")
			}
			return
		}
		when (name) {
			"haptics.tap" -> {
				activity.window.decorView.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
				settle?.invoke(DeviceOutcome.Value(JsValue.Null))
			}
			"location.current" -> {
				val answer = settle ?: {}
				if (locationGranted()) return locate(answer)
				if (locationAccess() == "blocked") return answer(REFUSED)
				waitingForAccess.add { if (locationGranted()) locate(answer) else answer(REFUSED) }
				askedLocation = true
				prefs.edit().putBoolean("asked-location", true).apply()
				activity.requestPermissions(LOCATION, LOCATION_REQUEST)
			}
			"sharesheet.open" -> {
				val options = (arguments.firstOrNull() as? JsValue.Obj)?.fields ?: throw MarklessHostError("sharesheet.open takes one object")
				val url = (options["url"] as? JsValue.Str)?.value ?: throw MarklessHostError("sharesheet.open needs a string url")
				val title = (options["title"] as? JsValue.Str)?.value
				sharing?.invoke(DeviceOutcome.Value(JsValue.Null))
				val answer = settle ?: {}
				sharing = answer
				val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url).putExtra(Intent.EXTRA_TITLE, title)
				try {
					activity.startActivityForResult(Intent.createChooser(send, title), SHARE_REQUEST)
				} catch (_: ActivityNotFoundException) {
					sharing = null
					answer(DeviceOutcome.Error("Error", "The share sheet failed"))
				}
			}
			"settings.open" -> {
				// Its own task: coming back to the app shows the app, not Settings left inside the app's task.
				activity.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", activity.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
				settle?.invoke(DeviceOutcome.Value(JsValue.Null))
			}
			else -> throw MarklessHostError("this device has no call $name")
		}
	}

	/** A handler wrote `active`: start (asking for the microphone first if it may) or stop; a refused start snaps `active` back. */
	private fun record(obj: String, on: Boolean) {
		val recorder = recorder(obj)
		if (!on) {
			waitingForMicrophone.remove(obj)
			return recorder.stop(keep = true)
		}
		when (recorderAccess()) {
			"granted" -> recorder.start()
			"blocked" -> {
				recorder.snapBack()
				emitAccess("recorder.access")
			}
			else -> {
				waitingForMicrophone.add(obj)
				askedRecorder = true
				prefs.edit().putBoolean("asked-recorder", true).apply()
				activity.requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), RECORDER_REQUEST)
			}
		}
	}

	override fun release(obj: String) {
		waitingForMicrophone.remove(obj)
		recorders[obj]?.release()
	}

	override fun resumed() {
		for (name in ACCESS) {
			val last = lastAccess[name] ?: continue
			if (access(name) == last) continue
			emitAccess(name)
			if (name == "camera.access") for (camera in cameras.values) camera.open()
		}
	}

	override fun activityResult(requestCode: Int) {
		if (requestCode != SHARE_REQUEST) return
		val answer = sharing ?: return
		sharing = null
		answer(DeviceOutcome.Value(JsValue.Null))
	}

	private fun locate(answer: (DeviceOutcome) -> Unit) {
		val locations = activity.getSystemService(LocationManager::class.java)
		val provider = if (locations.isProviderEnabled(LocationManager.GPS_PROVIDER)) LocationManager.GPS_PROVIDER else LocationManager.NETWORK_PROVIDER
		try {
			locations.getCurrentLocation(provider, null, activity.mainExecutor) { location ->
				if (location == null) answer(DeviceOutcome.Error("Error", "The position is not available"))
				else answer(DeviceOutcome.Value(JsValue.Obj(linkedMapOf(
					"latitude" to JsValue.Num(location.latitude), "longitude" to JsValue.Num(location.longitude),
					"accuracy" to JsValue.Num(location.accuracy.toDouble()),
				))))
			}
		} catch (_: SecurityException) {
			answer(REFUSED)
		}
	}

	override fun permissionsAnswered(requestCode: Int) {
		if (requestCode == RECORDER_REQUEST) {
			emitAccess("recorder.access")
			val granted = recorderAccess() == "granted"
			val waiting = ArrayList(waitingForMicrophone)
			waitingForMicrophone.clear()
			for (obj in waiting) if (granted) recorder(obj).start() else recorder(obj).snapBack()
			return
		}
		if (requestCode == CAMERA_REQUEST) {
			emitAccess("camera.access")
			for (camera in cameras.values) camera.open()
			return
		}
		if (requestCode != LOCATION_REQUEST) return
		emitAccess("location.access")
		val waiting = ArrayList(waitingForAccess)
		waitingForAccess.clear()
		for (resume in waiting) resume()
	}

	companion object {
		private val LOCATION = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
		private const val LOCATION_REQUEST = 4101
		private const val CAMERA_REQUEST = 4102
		private const val RECORDER_REQUEST = 4103
		private const val SHARE_REQUEST = 4104
		private val ACCESS = listOf("location.access", "camera.access", "recorder.access")
		private val REFUSED = DeviceOutcome.Error("NotAllowedError", "Location was refused")
		private val CAMERA_REFUSED = DeviceOutcome.Error("NotAllowedError", "The camera was refused")
	}
}

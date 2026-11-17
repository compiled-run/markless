package dev.markless.mobile.view

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
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
	/** The live value [name] now (`network.online`). */
	fun read(name: String): JsValue
	/** Calls [changed] with each new value of [name]. */
	fun watch(name: String, changed: (JsValue) -> Unit)
	/** Runs the call [name]; [settle], when given, receives how it ended. */
	fun call(name: String, arguments: List<JsValue>, settle: ((DeviceOutcome) -> Unit)?)
	/** The activity's permission answer, forwarded by [MarklessActivity]. */
	fun permissionsAnswered(requestCode: Int) {}
}

/** The phone's own features. */
class PlatformDevice(private val activity: Activity) : NativeDevice {
	private val main = Handler(Looper.getMainLooper())
	private val connectivity = activity.getSystemService(ConnectivityManager::class.java)
	private val watchers = HashMap<String, MutableList<(JsValue) -> Unit>>()
	private var online: Boolean? = null
	private val waitingForAccess = ArrayList<() -> Unit>()
	private var askedLocation = activity.getSharedPreferences("markless-device", Context.MODE_PRIVATE).getBoolean("asked-location", false)

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
		for (changed in watchers["network.online"].orEmpty()) changed(JsValue.Bool(now))
	}

	private fun locationGranted() = LOCATION.any { activity.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

	private fun locationAccess(): String = when {
		activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED -> "granted"
		activity.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED -> "limited"
		!askedLocation -> "unknown"
		activity.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION) -> "denied"
		else -> "blocked"
	}

	override fun read(name: String): JsValue = when (name) {
		"network.online" -> JsValue.Bool(networkOnline())
		"location.access" -> JsValue.Str(locationAccess())
		else -> throw MarklessHostError("this device has no live value $name")
	}

	override fun watch(name: String, changed: (JsValue) -> Unit) {
		read(name)
		watchers.getOrPut(name) { ArrayList() }.add(changed)
	}

	override fun call(name: String, arguments: List<JsValue>, settle: ((DeviceOutcome) -> Unit)?) {
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
				activity.getSharedPreferences("markless-device", Context.MODE_PRIVATE).edit().putBoolean("asked-location", true).apply()
				activity.requestPermissions(LOCATION, LOCATION_REQUEST)
			}
			else -> throw MarklessHostError("this device has no call $name")
		}
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
		if (requestCode != LOCATION_REQUEST) return
		for (changed in watchers["location.access"].orEmpty()) changed(JsValue.Str(locationAccess()))
		val waiting = ArrayList(waitingForAccess)
		waitingForAccess.clear()
		for (resume in waiting) resume()
	}

	companion object {
		private val LOCATION = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
		private const val LOCATION_REQUEST = 4101
		private val REFUSED = DeviceOutcome.Error("NotAllowedError", "Location was refused")
	}
}

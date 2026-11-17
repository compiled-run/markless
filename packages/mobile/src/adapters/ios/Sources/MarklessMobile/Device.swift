#if canImport(UIKit)
import CoreLocation
import Foundation
import MarklessCore
import Network
import UIKit

/// How a device call ended: its value, or an error by name (`NotAllowedError` when the person refused).
public enum DeviceOutcome {
	case value(NativeValue)
	case error(name: String, message: String)
}

/// The device features a payload names (`@markless/serializer/native-device` lists them). A host throws on any name its
/// device does not implement, so a payload is never half run.
@MainActor
public protocol NativeDevice: AnyObject {
	/// The live value `name` now (`network.online`).
	func read(_ name: String) throws -> NativeValue
	/// Calls `changed` with each new value of `name`.
	func watch(_ name: String, _ changed: @escaping @MainActor (NativeValue) -> Void) throws
	/// Runs the call `name`; `settle`, when given, receives how it ended.
	func call(_ name: String, _ arguments: [NativeValue], settle: (@MainActor (DeviceOutcome) -> Void)?) throws
}

/// The phone's own features.
@MainActor
public final class PlatformDevice: NSObject, NativeDevice, CLLocationManagerDelegate {
	private let path = NWPathMonitor()
	private var online: Bool
	private var watchers: [String: [@MainActor (NativeValue) -> Void]] = [:]
	private lazy var locations = CLLocationManager()
	private var waitingForAccess: [@MainActor () -> Void] = []
	private var waitingForPosition: [@MainActor (DeviceOutcome) -> Void] = []

	public override init() {
		online = path.currentPath.status == .satisfied
		super.init()
		path.pathUpdateHandler = { [weak self] update in
			let satisfied = update.status == .satisfied
			Task { @MainActor in self?.set("network.online", .bool(satisfied)) }
		}
		path.start(queue: .main)
	}

	public func read(_ name: String) throws -> NativeValue {
		switch name {
		case "network.online": return .bool(online)
		case "location.access": return .string(access(locations.authorizationStatus))
		default: throw HostError("this device has no live value \(name)")
		}
	}

	public func watch(_ name: String, _ changed: @escaping @MainActor (NativeValue) -> Void) throws {
		_ = try read(name)
		if name == "location.access" { locations.delegate = self }
		watchers[name, default: []].append(changed)
	}

	private func set(_ name: String, _ value: NativeValue) {
		if name == "network.online", case let .bool(now) = value {
			guard now != online else { return }
			online = now
		}
		for changed in watchers[name] ?? [] { changed(value) }
	}

	public func call(_ name: String, _ arguments: [NativeValue], settle: (@MainActor (DeviceOutcome) -> Void)?) throws {
		switch name {
		case "haptics.tap":
			UIImpactFeedbackGenerator(style: .light).impactOccurred()
			settle?(.value(.null))
		case "location.current":
			let answer = settle ?? { _ in }
			locations.delegate = self
			switch locations.authorizationStatus {
			case .denied, .restricted:
				answer(.error(name: "NotAllowedError", message: "Location was refused"))
			case .notDetermined:
				waitingForAccess.append { [weak self] in self?.locate(answer) }
				locations.requestWhenInUseAuthorization()
			default:
				locate(answer)
			}
		default:
			throw HostError("this device has no call \(name)")
		}
	}

	private func locate(_ answer: @escaping @MainActor (DeviceOutcome) -> Void) {
		switch locations.authorizationStatus {
		case .denied, .restricted: answer(.error(name: "NotAllowedError", message: "Location was refused"))
		default:
			waitingForPosition.append(answer)
			locations.requestLocation()
		}
	}

	private func access(_ status: CLAuthorizationStatus) -> String {
		switch status {
		case .notDetermined: return "unknown"
		case .restricted: return "blocked"
		case .denied: return "denied"
		default: return locations.accuracyAuthorization == .reducedAccuracy ? "limited" : "granted"
		}
	}

	public nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
		Task { @MainActor in
			self.set("location.access", .string(self.access(self.locations.authorizationStatus)))
			if self.locations.authorizationStatus == .notDetermined { return }
			let waiting = self.waitingForAccess
			self.waitingForAccess = []
			for resume in waiting { resume() }
		}
	}

	public nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations updates: [CLLocation]) {
		guard let last = updates.last else { return }
		let position = NativeValue.object([
			("latitude", .number(last.coordinate.latitude)), ("longitude", .number(last.coordinate.longitude)),
			("accuracy", .number(last.horizontalAccuracy)),
		])
		Task { @MainActor in self.answerPosition(.value(position)) }
	}

	public nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
		let refused = (error as? CLError)?.code == .denied
		let message = error.localizedDescription
		Task { @MainActor in
			self.answerPosition(refused ? .error(name: "NotAllowedError", message: "Location was refused") : .error(name: "Error", message: message))
		}
	}

	private func answerPosition(_ outcome: DeviceOutcome) {
		let waiting = waitingForPosition
		waitingForPosition = []
		for answer in waiting { answer(outcome) }
	}
}
#endif

import AVFoundation
import MarklessCore
import MarklessMobile
import UIKit

/// The proof build's device: the phone's own, except that it lists every call it receives in the label
/// `markless-device-calls`, a `markless-proof://device/<value>?value=<json>` link sets a live value (the simulator shares
/// the Mac's network, so it cannot go offline by itself), and its camera is a test double: the simulator has none. The
/// camera permission prompt and the preview view class are the host's real ones; the frames are a drawn test pattern,
/// and a photo is that pattern written to a file. Its recorder is a test double too: the Mac running the simulator may
/// have no microphone. The microphone prompt and `recorder.access` are real; while recording, seconds tick from a timer,
/// and the clip is a generated tone written to a file the real player plays. `markless-microphone` shows whether one records.
@MainActor
final class ProofDevice: NativeDevice {
	static let shared = ProofDevice()
	let platform = PlatformDevice()
	let label = UILabel()
	let cameraLabel = UILabel()
	let microphoneLabel = UILabel()
	private var calls: [String] = []
	private var faked: [String: NativeValue] = [:]
	private var watchers: [String: [@MainActor (NativeValue) -> Void]] = [:]
	private var cameraReady: [String: Bool] = [:]
	private var cameraFacing: [String: String] = [:]
	private var waitingForReady: [String: [() -> Void]] = [:]
	private var recording: [String: Int] = [:]
	private var recorderFields: [String: [String: NativeValue]] = [:]
	private var ticking: Timer?

	init() {
		for (view, id, text) in [(label, "markless-device-calls", "calls: none"), (cameraLabel, "markless-camera", "camera off"), (microphoneLabel, "markless-microphone", "microphone off")] {
			view.accessibilityIdentifier = id
			view.font = .systemFont(ofSize: 12)
			view.textColor = .secondaryLabel
			view.text = text
		}
	}

	private func key(_ name: String, _ object: String?) -> String { object.map { "\($0)#\(name)" } ?? name }

	private func emit(_ name: String, _ object: String?, _ value: NativeValue) {
		for changed in watchers[key(name, object)] ?? [] { changed(value) }
	}

	func read(_ name: String, object: String?) throws -> NativeValue {
		if let object, name.hasPrefix("recorder.") { return recorderField(object, name) }
		if let object, name == "camera.ready" { return .bool(cameraReady[object] ?? false) }
		if let object, name == "camera.facing" { return .string(cameraFacing[object] ?? "back") }
		return try faked[name] ?? platform.read(name, object: object)
	}

	func watch(_ name: String, object: String?, _ changed: @escaping @MainActor (NativeValue) -> Void) throws {
		watchers[key(name, object), default: []].append(changed)
		if object != nil, name.hasPrefix("camera.") || name.hasPrefix("recorder.") { return }
		try platform.watch(name, object: object) { [weak self] value in if self?.faked[name] == nil { changed(value) } }
	}

	func call(_ name: String, object: String?, _ arguments: [NativeValue], settle: (@MainActor (DeviceOutcome) -> Void)?) throws {
		calls.append(name)
		label.text = "calls: " + calls.joined(separator: ", ")
		if let object, name == "recorder.active" { return record(object, arguments.first == .bool(true)) }
		guard let object, name.hasPrefix("camera.") else { return try platform.call(name, object: object, arguments, settle: settle) }
		switch name {
		case "camera.facing":
			if case let .string(facing)? = arguments.first { cameraFacing[object] = facing }
		case "camera.takePhoto":
			if cameraRefused() {
				settle?(.error(name: "NotAllowedError", message: "The camera was refused"))
				return
			}
			let take: () -> Void = { _ = settle?(ProofDevice.photo()) }
			if cameraReady[object] == true { take() } else { waitingForReady[object, default: []].append(take) }
		default:
			throw HostError("the test camera has no call \(name)")
		}
	}

	func release(_ object: String) {
		platform.release(object)
		if recorderFields[object] != nil {
			recording[object] = nil
			setRecorder(object, "recorder.active", .bool(false))
			setRecorder(object, "recorder.seconds", .number(0))
			setRecorder(object, "recorder.clip", .null)
		}
		if cameraReady[object] != nil { setReady(object, false) }
	}

	private func recorderField(_ object: String, _ name: String) -> NativeValue {
		recorderFields[object]?[name] ?? (name == "recorder.active" ? .bool(false) : name == "recorder.seconds" ? .number(0) : .null)
	}

	private func setRecorder(_ object: String, _ name: String, _ value: NativeValue) {
		recorderFields[object, default: [:]][name] = value
		microphoneLabel.text = recording.isEmpty ? "microphone off" : "microphone on"
		emit(name, object, value)
	}

	/// The microphone is asked for for real; a refusal snaps `active` back as the host's recorder does.
	private func record(_ object: String, _ on: Bool) {
		guard on else {
			guard let seconds = recording.removeValue(forKey: object) else { return }
			setRecorder(object, "recorder.active", .bool(false))
			setRecorder(object, "recorder.clip", ProofDevice.tone(seconds: max(seconds, 1)))
			return
		}
		guard recording[object] == nil else { return }
		Task {
			let granted = await AVAudioApplication.requestRecordPermission()
			self.emit("recorder.access", nil, try! self.platform.read("recorder.access", object: nil))
			guard granted else { return self.setRecorder(object, "recorder.active", .bool(false)) }
			self.recording[object] = 0
			self.setRecorder(object, "recorder.active", .bool(true))
			self.setRecorder(object, "recorder.seconds", .number(0))
			self.tick()
		}
	}

	private func tick() {
		guard ticking == nil else { return }
		ticking = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
			Task { @MainActor in
				guard !self.recording.isEmpty else {
					self.ticking?.invalidate()
					self.ticking = nil
					return
				}
				for (object, seconds) in self.recording {
					self.recording[object] = seconds + 1
					self.setRecorder(object, "recorder.seconds", .number(Double(seconds + 1)))
				}
			}
		}
	}

	/// A quiet 440 Hz tone as long as the recording, written as AAC: the clip the real player plays.
	private static func tone(seconds: Int) -> NativeValue {
		let url = FileManager.default.temporaryDirectory.appending(path: "markless-clip-\(UUID().uuidString).m4a")
		let rate = 44_100.0
		guard let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1),
			let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(rate * Double(seconds))),
			let file = try? AVAudioFile(forWriting: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1])
		else { return .null }
		buffer.frameLength = buffer.frameCapacity
		for frame in 0..<Int(buffer.frameLength) { buffer.floatChannelData![0][frame] = Float(0.1 * sin(2 * .pi * 440 * Double(frame) / rate)) }
		guard (try? file.write(from: buffer)) != nil else { return .null }
		return .string(url.absoluteString)
	}

	func view(for object: String, device: String) throws -> UIView {
		guard device == "camera" else { return try platform.view(for: object, device: device) }
		let view = CameraPreviewView()
		let pattern = UIImageView(image: ProofDevice.pattern())
		pattern.contentMode = .scaleAspectFill
		pattern.frame = view.bounds
		pattern.autoresizingMask = [.flexibleWidth, .flexibleHeight]
		view.addSubview(pattern)
		view.onWindow = { [weak self] inWindow in self?.camera(object, running: inWindow) }
		return view
	}

	private func camera(_ object: String, running: Bool) {
		guard running else { return setReady(object, false) }
		AVCaptureDevice.requestAccess(for: .video) { granted in
			Task { @MainActor in
				self.emit("camera.access", nil, try! self.platform.read("camera.access", object: nil))
				if granted { self.setReady(object, true) }
			}
		}
	}

	private func setReady(_ object: String, _ ready: Bool) {
		cameraReady[object] = ready
		cameraLabel.text = ready ? "camera on" : "camera off"
		emit("camera.ready", object, .bool(ready))
		if ready { for take in waitingForReady.removeValue(forKey: object) ?? [] { take() } }
	}

	private static func pattern() -> UIImage {
		UIGraphicsImageRenderer(size: CGSize(width: 320, height: 240)).image { context in
			UIColor.systemTeal.setFill()
			context.fill(CGRect(x: 0, y: 0, width: 320, height: 240))
			UIColor.systemOrange.setFill()
			context.fill(CGRect(x: 110, y: 70, width: 100, height: 100))
		}
	}

	private static func photo() -> DeviceOutcome {
		let image = pattern()
		guard let data = image.jpegData(compressionQuality: 0.8) else { return .error(name: "Error", message: "no test photo") }
		return savePhoto(data, size: image.size)
	}

	func open(_ url: URL) {
		guard url.scheme == "markless-proof", url.host == "device",
			let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "value" })?.value,
			let json = try? JSONValue.parse(Data(value.utf8))
		else { return NSLog("markless-shell: ignored link %@", url.absoluteString) }
		let name = String(url.path.dropFirst())
		faked[name] = NativeValue(json: json)
		emit(name, nil, NativeValue(json: json))
	}
}

@main
final class ShellDelegate: UIResponder, UIApplicationDelegate {
	func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
		let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
		configuration.delegateClass = ShellSceneDelegate.self
		return configuration
	}
}

final class ShellSceneDelegate: UIResponder, UIWindowSceneDelegate {
	var window: UIWindow?

	func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
		guard let scene = scene as? UIWindowScene else { return }
		let window = UIWindow(windowScene: scene)
		// `markless-proof://app/<path>` opens the app at a route; `markless-proof://device/...` sets a test device value.
		window.rootViewController = Self.root(path: options.urlContexts.first { $0.url.host == "app" }.map { MarklessRoot.path(of: $0.url) })
		window.makeKeyAndVisible()
		let label = ProofDevice.shared.label
		let cameraLabel = ProofDevice.shared.cameraLabel
		let microphoneLabel = ProofDevice.shared.microphoneLabel
		for view in [label, cameraLabel, microphoneLabel] {
			view.translatesAutoresizingMaskIntoConstraints = false
			window.addSubview(view)
		}
		NSLayoutConstraint.activate([
			label.leadingAnchor.constraint(equalTo: window.safeAreaLayoutGuide.leadingAnchor, constant: 16),
			label.bottomAnchor.constraint(equalTo: window.safeAreaLayoutGuide.bottomAnchor, constant: -8),
			cameraLabel.leadingAnchor.constraint(equalTo: label.leadingAnchor),
			cameraLabel.bottomAnchor.constraint(equalTo: label.topAnchor, constant: -4),
			microphoneLabel.leadingAnchor.constraint(equalTo: label.leadingAnchor),
			microphoneLabel.bottomAnchor.constraint(equalTo: cameraLabel.topAnchor, constant: -4),
		])
		self.window = window
		for context in options.urlContexts where context.url.host == "device" { ProofDevice.shared.open(context.url) }
	}

	func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
		for context in contexts {
			if context.url.host == "device" { ProofDevice.shared.open(context.url); continue }
			guard let root = window?.rootViewController else { return }
			do {
				try MarklessRoot.open(MarklessRoot.path(of: context.url), in: root)
			} catch {
				NSLog("markless-shell: %@", "\(error)")
			}
		}
	}

	@MainActor
	private static func root(path: String?) -> UIViewController {
		do {
			let bundle = Bundle.main.bundleURL
			let payload = try Data(contentsOf: bundle.appending(path: "markless/payload.json"))
			let style = try? Data(contentsOf: bundle.appending(path: "markless/style.json"))
			var fonts: [String: Data] = [:]
			let fontFolder = bundle.appending(path: "markless-fonts")
			for file in (try? FileManager.default.contentsOfDirectory(at: fontFolder, includingPropertiesForKeys: nil)) ?? [] {
				fonts["sha256:" + file.deletingPathExtension().lastPathComponent] = try Data(contentsOf: file)
			}
			return try MarklessRoot.controller(payload: payload, style: style, fonts: fonts, path: path, device: ProofDevice.shared)
		} catch {
			NSLog("markless-shell: %@", "\(error)")
			let controller = UIViewController()
			let label = UILabel()
			label.numberOfLines = 0
			label.text = "markless-shell error: \(error)"
			label.frame = CGRect(x: 16, y: 80, width: 360, height: 400)
			controller.view.backgroundColor = .white
			controller.view.addSubview(label)
			return controller
		}
	}
}

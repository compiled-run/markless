import MarklessCore
import MarklessMobile
import UIKit

/// The proof build's device: the phone's own, except that it lists every call it receives in the label
/// `markless-device-calls`, and that a `markless-proof://device/<value>?value=<json>` link sets a live value
/// (the simulator shares the Mac's network, so it cannot go offline by itself).
@MainActor
final class ProofDevice: NativeDevice {
	static let shared = ProofDevice()
	let platform = PlatformDevice()
	let label = UILabel()
	private var calls: [String] = []
	private var faked: [String: NativeValue] = [:]
	private var watchers: [String: [@MainActor (NativeValue) -> Void]] = [:]

	init() {
		label.accessibilityIdentifier = "markless-device-calls"
		label.font = .systemFont(ofSize: 12)
		label.textColor = .secondaryLabel
		label.text = "calls: none"
	}

	func read(_ name: String) throws -> NativeValue { try faked[name] ?? platform.read(name) }

	func watch(_ name: String, _ changed: @escaping @MainActor (NativeValue) -> Void) throws {
		watchers[name, default: []].append(changed)
		try platform.watch(name) { [weak self] value in if self?.faked[name] == nil { changed(value) } }
	}

	func call(_ name: String, _ arguments: [NativeValue], settle: (@MainActor (DeviceOutcome) -> Void)?) throws {
		calls.append(name)
		label.text = "calls: " + calls.joined(separator: ", ")
		try platform.call(name, arguments, settle: settle)
	}

	func open(_ url: URL) {
		guard url.scheme == "markless-proof", url.host == "device",
			let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "value" })?.value,
			let json = try? JSONValue.parse(Data(value.utf8))
		else { return NSLog("markless-shell: ignored link %@", url.absoluteString) }
		let name = String(url.path.dropFirst())
		faked[name] = NativeValue(json: json)
		for changed in watchers[name] ?? [] { changed(NativeValue(json: json)) }
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
		window.rootViewController = Self.root()
		window.makeKeyAndVisible()
		let label = ProofDevice.shared.label
		label.translatesAutoresizingMaskIntoConstraints = false
		window.addSubview(label)
		NSLayoutConstraint.activate([
			label.leadingAnchor.constraint(equalTo: window.safeAreaLayoutGuide.leadingAnchor, constant: 16),
			label.bottomAnchor.constraint(equalTo: window.safeAreaLayoutGuide.bottomAnchor, constant: -8),
		])
		self.window = window
		for context in options.urlContexts { ProofDevice.shared.open(context.url) }
	}

	func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
		for context in contexts { ProofDevice.shared.open(context.url) }
	}

	@MainActor
	private static func root() -> UIViewController {
		do {
			let bundle = Bundle.main.bundleURL
			let payload = try Data(contentsOf: bundle.appending(path: "markless/payload.json"))
			let style = try? Data(contentsOf: bundle.appending(path: "markless/style.json"))
			var fonts: [String: Data] = [:]
			let fontFolder = bundle.appending(path: "markless-fonts")
			for file in (try? FileManager.default.contentsOfDirectory(at: fontFolder, includingPropertiesForKeys: nil)) ?? [] {
				fonts["sha256:" + file.deletingPathExtension().lastPathComponent] = try Data(contentsOf: file)
			}
			return try MarklessViewController(payload: payload, style: style, fonts: fonts, device: ProofDevice.shared)
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

import MarklessMobile
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
	func application(
		_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions
	) -> UISceneConfiguration {
		let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
		configuration.delegateClass = SceneDelegate.self
		return configuration
	}
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
	var window: UIWindow?

	func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
		guard let scene = scene as? UIWindowScene else { return }
		let window = UIWindow(windowScene: scene)
		window.rootViewController = makeRoot()
		window.makeKeyAndVisible()
		self.window = window
	}

	private func makeRoot() -> UIViewController {
		let resources = Bundle.main.resourceURL!
		do {
			let payload = try Data(contentsOf: resources.appendingPathComponent("payload.json"))
			let styleURL = resources.appendingPathComponent("style.json")
			let style = FileManager.default.fileExists(atPath: styleURL.path) ? try Data(contentsOf: styleURL) : nil
			var fonts: [String: Data] = [:]
			let fontDirectory = resources.appendingPathComponent("fonts")
			for file in (try? FileManager.default.contentsOfDirectory(at: fontDirectory, includingPropertiesForKeys: nil)) ?? [] {
				fonts["sha256:" + file.deletingPathExtension().lastPathComponent] = try Data(contentsOf: file)
			}
			return try MarklessViewController(payload: payload, style: style, fonts: fonts)
		} catch {
			NSLog("Markless shell: %@", "\(error)")
			let failure = UIViewController()
			let label = UILabel()
			label.text = "Markless host refused the payload:\n\(error)"
			label.textColor = .systemRed
			label.numberOfLines = 0
			label.accessibilityIdentifier = "markless-error"
			label.frame = CGRect(x: 16, y: 80, width: 360, height: 600)
			failure.view.backgroundColor = .systemBackground
			failure.view.addSubview(label)
			return failure
		}
	}
}

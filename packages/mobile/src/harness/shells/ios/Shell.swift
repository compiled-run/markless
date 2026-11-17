import MarklessMobile
import UIKit

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
		window.rootViewController = Self.root(path: options.urlContexts.first.map { MarklessRoot.path(of: $0.url) })
		window.makeKeyAndVisible()
		self.window = window
	}

	func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
		guard let url = contexts.first?.url, let root = window?.rootViewController else { return }
		do {
			try MarklessRoot.open(MarklessRoot.path(of: url), in: root)
		} catch {
			NSLog("markless-shell: %@", "\(error)")
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
			return try MarklessRoot.controller(payload: payload, style: style, fonts: fonts, path: path)
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

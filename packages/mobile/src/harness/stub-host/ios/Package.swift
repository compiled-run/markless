// swift-tools-version: 6.0
import PackageDescription

let package = Package(
	name: "MarklessMobile",
	platforms: [.iOS(.v18)],
	products: [.library(name: "MarklessMobile", targets: ["MarklessMobile"])],
	targets: [.target(name: "MarklessMobile")]
)

import SwiftUI
import SafariServices

private enum Destination: String, Identifiable {
    case capture = "/reports/new", dashboard = "/dashboard", reports = "/reports"
    var id: String { rawValue }
    var url: URL {
        URL(string: "https://pierwsze-koty-za-ploty-git-feature-claude-api-mikeymcyo.vercel.app" + rawValue)!
    }
}

private struct SiteBrowser: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

@main
struct SiteBossTestApp: App {
    @State private var destination: Destination?
    var body: some Scene {
        WindowGroup {
            VStack(spacing: 16) {
                Text("SiteBoss Pro").font(.largeTitle.bold())
                Button("Site Capture") { destination = .capture }
                    .buttonStyle(.borderedProminent)
                Button("Dashboard") { destination = .dashboard }
                Button("Reports") { destination = .reports }
            }
            .controlSize(.large)
            .tint(.orange)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .preferredColorScheme(.dark)
            .fullScreenCover(item: $destination) { target in
                SiteBrowser(url: target.url).ignoresSafeArea()
            }
        }
    }
}

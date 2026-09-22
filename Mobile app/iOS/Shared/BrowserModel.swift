import SwiftUI
import WebKit

// All requests, including auth, stay inside the same WKWebView origin. No token bridge.
@MainActor
final class BrowserModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    let role: AppRole
    @Published private(set) var webView: WKWebView?
    @Published private(set) var origin: URL?
    @Published private(set) var generation = UUID()
    @Published private(set) var loading = false
    @Published private(set) var canGoBack = false
    @Published private(set) var failure: String?
    @Published var notice: String?
    private var backObservation: NSKeyValueObservation?
    private let serverKey = "ParklyServerOrigin"

    override init() {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "ParklyRole") as? String,
              let role = AppRole(rawValue: value) else { fatalError("Missing ParklyRole in target Info.plist") }
        self.role = role
        super.init()
        let configured = Bundle.main.object(forInfoDictionaryKey: "ParklyServerURL") as? String ?? ""
        #if DEBUG
        let value = UserDefaults.standard.string(forKey: serverKey) ?? configured
        let localHTTP = true
        #else
        let value = configured
        let localHTTP = false
        #endif
        do {
            origin = try ServerPolicy.origin(value, allowLocalHTTP: localHTTP)
            createWebView()
            home()
        } catch {
            failure = "ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์ที่ใช้ได้ เปิดการตั้งค่าการเชื่อมต่อ หรือติดต่อผู้ดูแลแอพ"
        }
    }

    private func createWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        if let resource = Bundle.main.url(forResource: "mobile", withExtension: "css"),
           let css = try? String(contentsOf: resource, encoding: .utf8),
           let encoded = try? JSONEncoder().encode(css), let literal = String(data: encoded, encoding: .utf8) {
            // Styling only. Authorization remains entirely in the existing server APIs.
            let script = """
            (() => {
            const style = document.createElement('style');
            style.textContent = \(literal);
            document.head.appendChild(style);
            document.documentElement.dataset.parklyApp = '\(role.rawValue)';
            })();
            """
            configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        }
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.allowsBackForwardNavigationGestures = true
        view.isOpaque = false
        backObservation = view.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
            DispatchQueue.main.async { self?.canGoBack = view.canGoBack }
        }
        generation = UUID()
        webView = view
    }

    func home() {
        guard let origin, let url = URL(string: role.homePath, relativeTo: origin)?.absoluteURL else { return }
        failure = nil
        // Always a GET: never automatically replay a failed booking or other mutation.
        webView?.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
    }

    func back() { if webView?.canGoBack == true { webView?.goBack() } }

    #if DEBUG
    func changeServer(_ newOrigin: URL, completion: @escaping () -> Void) {
        clearWebData { [weak self] in
            guard let self else { return }
            self.origin = newOrigin
            UserDefaults.standard.set(newOrigin.absoluteString, forKey: self.serverKey)
            self.createWebView()
            self.home()
            completion()
        }
    }
    #endif

    func resetSession(completion: @escaping () -> Void) {
        clearWebData { [weak self] in
            guard let self else { return }
            self.createWebView()
            self.home()
            completion()
        }
    }

    private func clearWebData(completion: @escaping () -> Void) {
        webView?.stopLoading()
        webView?.navigationDelegate = nil
        webView?.uiDelegate = nil
        webView = nil
        backObservation = nil
        loading = false
        canGoBack = false
        WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
            DispatchQueue.main.async(execute: completion)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let origin else { decisionHandler(.cancel); return }
        if ServerPolicy.sameOrigin(url, origin) {
            guard role.permitsPage(url) else {
                decisionHandler(.cancel)
                notice = "หน้านี้อยู่นอกบทบาทของแอพ โปรดเปิดแอพ Parkly ที่ตรงกับบัญชีของคุณ"
                return
            }
            if navigationAction.targetFrame == nil {
                decisionHandler(.cancel)
                webView.load(navigationAction.request)
            } else { decisionHandler(.allow) }
            return
        }
        decisionHandler(.cancel)
        // Only a deliberate link tap may leave the app. Redirects never open Safari.
        if navigationAction.navigationType == .linkActivated,
           ["https", "http", "mailto", "tel"].contains(url.scheme?.lowercased() ?? ""),
           url.user == nil, url.password == nil {
            UIApplication.shared.open(url)
        } else {
            notice = "แอพบล็อกการเปลี่ยนไปยังเซิร์ฟเวอร์อื่น โปรดตรวจ URL ในการตั้งค่า"
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame, let response = navigationResponse.response as? HTTPURLResponse,
           !(200...299).contains(response.statusCode) {
            loading = false
            failure = "เซิร์ฟเวอร์ตอบกลับ HTTP \(response.statusCode) ตรวจสอบ URL และสถานะเซิร์ฟเวอร์ แล้วเปิดหน้าแรกอีกครั้ง"
            decisionHandler(.cancel)
        } else { decisionHandler(.allow) }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        failure = nil
        loading = true
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loading = false }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { show(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { show(error) }

    private func show(_ error: Error) {
        // Cancellation is expected when a navigation is intentionally blocked.
        guard (error as NSError).code != NSURLErrorCancelled else { loading = false; return }
        loading = false
        failure = "เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ต, Wi-Fi, สิทธิ์ Local Network และว่าเซิร์ฟเวอร์เปิดอยู่ หากเพิ่งส่งการจอง ให้ตรวจรายการเดิมก่อนทำซ้ำ"
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loading = false
        failure = "หน้าแอพหยุดทำงาน กรุณาเปิดหน้าแรกอีกครั้ง หากเพิ่งทำรายการ ให้ตรวจสอบผลก่อนส่งซ้ำ"
    }

    private func present(_ alert: UIAlertController, fallback: () -> Void) {
        guard var presenter = webView?.window?.rootViewController else { fallback(); return }
        while let presented = presenter.presentedViewController { presenter = presented }
        guard !(presenter is UIAlertController), !presenter.isBeingDismissed else { fallback(); return }
        presenter.present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: role.title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "ตกลง", style: .default) { _ in completionHandler() })
        present(alert, fallback: completionHandler)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: role.title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "ยกเลิก", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "ตกลง", style: .default) { _ in completionHandler(true) })
        present(alert) { completionHandler(false) }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: role.title, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "ยกเลิก", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "ตกลง", style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text) })
        present(alert) { completionHandler(nil) }
    }
}

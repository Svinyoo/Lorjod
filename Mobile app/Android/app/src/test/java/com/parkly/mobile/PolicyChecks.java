package com.parkly.mobile;

import java.net.URI;

/** Runs both standalone (no SDK/JUnit needed) and inside Gradle's unit tests. */
public final class PolicyChecks {
    private static int checks;
    private static void check(boolean result, String reason) {
        if (!result) throw new AssertionError(reason);
        checks++;
    }
    private static void rejected(String value, boolean debug) {
        try { ServerPolicy.origin(value, debug); throw new AssertionError("Accepted unsafe URL: " + value); }
        catch (IllegalArgumentException expected) { checks++; }
    }
    public static void main(String[] arguments) { runChecks(); }
    public static void runChecks() {
        checks = 0;
        URI origin = ServerPolicy.origin("  HTTPS://PARKLY.EXAMPLE.COM/  ", false);
        check(origin.toString().equals("https://parkly.example.com"), "Normalize origin");
        for (String host : new String[]{"localhost", "127.0.0.1", "10.0.2.2", "10.0.0.2", "172.16.0.1", "172.31.255.255", "192.168.1.10", "mac.local", "[::1]"}) {
            check(ServerPolicy.origin("http://" + host + ":3000", true).getPort() == 3000, "Debug LAN host: " + host);
            rejected("http://" + host + ":3000", false);
        }
        for (String value : new String[]{"", "parkly.example.com", "https://", "file:///tmp/x", "javascript:alert(1)", "intent://app", "https://user:pass@example.com", "https://example.com/landlord/", "https://example.com?next=x", "https://example.com/#admin", "https://example.com:0", "https://example.com:65536", "https://exa mple.com", "http://public.example.com", "http://192.168.1.999", "http://172.15.0.1", "http://172.32.0.1", "http://192.168.1.10.evil.com", "http://localhost.evil.com", "http://127.1", "http://2130706433", "http://0177.0.0.1", "http://0x7f000001", "https://example.com/%2f", "https://example.com\\@evil.com"}) rejected(value, true);
        rejected(null, true);
        check(ServerPolicy.sameOrigin(URI.create("https://parkly.example.com:443/login.html"), origin), "Equivalent HTTPS port");
        for (String value : new String[]{"http://parkly.example.com", "https://parkly.example.com:8443", "https://parkly.example.com.evil.com", "https://user@parkly.example.com", "file:///tmp/x"}) {
            check(!ServerPolicy.sameOrigin(URI.create(value), origin), "Origin mismatch: " + value);
        }
        check(!ServerPolicy.sameOrigin(null, origin), "Null origin rejected");
        for (ServerPolicy.Role role : ServerPolicy.Role.values()) {
            check(ServerPolicy.Role.from(role.value) == role, "Build role");
            check(role.permitsPage(origin.resolve(role.homePath())), "Role home");
            String prefix = role == ServerPolicy.Role.RENTER ? "" : "/" + role.value;
            check(role.permitsPage(origin.resolve(prefix + "/login.html")), "Role login");
            check(role.permitsPage(origin.resolve(prefix + "/register.html")) == (role != ServerPolicy.Role.ADMIN), "No admin registration");
            for (ServerPolicy.Role other : ServerPolicy.Role.values()) if (other != role) check(!role.permitsPage(origin.resolve(other.homePath())), "Cross role denied");
            for (String path : new String[]{"/api/auth/me", "/server/index.js", "/admin/%2e%2e/landlord/", "/%2flogin.html", prefix + "/unknown.html"}) {
                check(!role.permitsPage(origin.resolve(path)), "Non-page denied: " + path);
            }
        }
        for (String value : new String[]{"https://www.google.com/maps/search/?api=1", "mailto:support@example.com", "tel:+6620000000"}) check(ServerPolicy.permitsExternal(URI.create(value)), "External user link allowed");
        for (String value : new String[]{"intent://app", "file:///tmp/x", "javascript:alert(1)", "content://documents/x", "https://user:pass@example.com", "http://example.com"}) check(!ServerPolicy.permitsExternal(URI.create(value)), "Unsafe external link blocked");
        System.out.println("Android ServerPolicy: " + checks + " checks passed.");
    }
}

package com.parkly.mobile;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;
import java.util.Locale;

/** Pure Java policy shared by the app and JVM tests. No Android dependencies. */
public final class ServerPolicy {
    private ServerPolicy() {}

    public enum Role {
        RENTER("renter", "ผู้เช่าที่จอดรถ"),
        LANDLORD("landlord", "ผู้ให้เช่าลานจอด"),
        ADMIN("admin", "ผู้ดูแลระบบ");

        public final String value;
        public final String title;
        Role(String value, String title) { this.value = value; this.title = title; }
        public String homePath() { return this == RENTER ? "/" : "/" + value + "/"; }
        public boolean permitsPage(URI url) {
            String prefix = this == RENTER ? "" : "/" + value;
            String path = url.getRawPath();
            return Arrays.asList(prefix, prefix + "/", prefix + "/index.html", prefix + "/login.html").contains(path)
                || (this != ADMIN && (prefix + "/register.html").equals(path));
        }
        public static Role from(String value) {
            for (Role role : values()) if (role.value.equals(value)) return role;
            throw new IllegalArgumentException("Unknown app role");
        }
    }

    public static URI origin(String value, boolean allowLocalHTTP) {
        try {
            URI uri = new URI(value == null ? "" : value.trim());
            String host = uri.getHost();
            String scheme = uri.getScheme();
            if (host == null || host.isEmpty() || scheme == null || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || !("".equals(uri.getRawPath()) || "/".equals(uri.getRawPath()))
                || uri.getPort() == 0 || uri.getPort() > 65535) {
                throw new IllegalArgumentException("ใส่ URL ของเซิร์ฟเวอร์เท่านั้น ไม่ใส่ path, บัญชี, query หรือ #");
            }
            scheme = scheme.toLowerCase(Locale.ROOT);
            host = host.toLowerCase(Locale.ROOT);
            if (!"https".equals(scheme) && !("http".equals(scheme) && allowLocalHTTP && isLocal(host))) {
                throw new IllegalArgumentException("ต้องใช้ HTTPS; Debug อนุญาต HTTP เฉพาะ localhost, .local และ IPv4 เครือข่ายส่วนตัว");
            }
            return new URI(scheme, null, host, uri.getPort(), "", null, null);
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("รูปแบบ URL ไม่ถูกต้อง เช่น https://parkly.example.com", error);
        }
    }

    public static boolean sameOrigin(URI first, URI second) {
        return first != null && second != null && first.getHost() != null && second.getHost() != null
            && first.getScheme() != null && second.getScheme() != null
            && first.getRawUserInfo() == null && second.getRawUserInfo() == null
            && first.getHost().equalsIgnoreCase(second.getHost())
            && first.getScheme().equalsIgnoreCase(second.getScheme())
            && port(first) == port(second);
    }

    private static int port(URI uri) {
        return uri.getPort() == -1 ? ("https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80) : uri.getPort();
    }

    public static boolean permitsExternal(URI uri) {
        if (uri == null || uri.getScheme() == null || uri.getRawUserInfo() != null) return false;
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if ("https".equals(scheme)) return uri.getHost() != null;
        return ("mailto".equals(scheme) || "tel".equals(scheme)) && !uri.getSchemeSpecificPart().isEmpty();
    }

    private static boolean isLocal(String host) {
        if (host.equals("localhost") || host.endsWith(".local") || host.equals("[::1]")) return true;
        String[] parts = host.split("\\.", -1);
        if (parts.length != 4) return false;
        int[] numbers = new int[4];
        for (int i = 0; i < 4; i++) {
            // Reject alternate/octal forms to keep browser and Java interpretation identical.
            if (!parts[i].matches("0|[1-9][0-9]{0,2}")) return false;
            numbers[i] = Integer.parseInt(parts[i]);
            if (numbers[i] > 255) return false;
        }
        return numbers[0] == 10 || numbers[0] == 127
            || (numbers[0] == 172 && numbers[1] >= 16 && numbers[1] <= 31)
            || (numbers[0] == 192 && numbers[1] == 168);
    }
}

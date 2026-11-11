package stodd.core.config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The TOML the STODD config files are written in: a reader for the whole language as far as config files use it (tables, dotted
 * keys, basic / literal / multi-line strings, integers in every base, floats, booleans, arrays over several lines, inline tables;
 * dates are read as text) and a writer for values. Only the JDK is used, so it runs in the tests as well as in the game.
 *
 * {@link #parse} gives one flat map from full dotted path ("logPose.dwellTicks") to value: Long, Double, Boolean, String,
 * List (of values) or Map (an inline table, String -> value).
 */
public final class Toml {
    private Toml() { }

    public static final class TomlException extends Exception {
        public final int line;
        TomlException(int line, String msg) { super("line " + line + ": " + msg); this.line = line; }
    }

    // ---------------------------------------------------------------- reading

    public static Map<String, Object> parse(String text) throws TomlException {
        return new Reader(text == null ? "" : text).document();
    }

    /** One value on its own ("600", "'/x/i'", "[1, 2]") - what /stodd config set and the config screen type in. */
    public static Object parseValue(String text) throws TomlException {
        Reader r = new Reader(text == null ? "" : text.trim());
        Object v = r.value();
        r.skipSpace();
        if (!r.end()) throw r.err("unexpected text after the value");
        return v;
    }

    private static final class Reader {
        final String s;
        int i = 0, line = 1;
        Reader(String s) { this.s = s; }

        boolean end() { return i >= s.length(); }
        char peek() { return i < s.length() ? s.charAt(i) : '\0'; }
        char peek(int k) { return i + k < s.length() ? s.charAt(i + k) : '\0'; }
        char next() { char c = s.charAt(i++); if (c == '\n') line++; return c; }
        TomlException err(String m) { return new TomlException(line, m); }

        void skipSpace() { while (!end() && (peek() == ' ' || peek() == '\t')) i++; }

        void skipComment() { if (peek() == '#') while (!end() && peek() != '\n') i++; }

        /** spaces, comments and newlines */
        void skipAll() {
            while (!end()) {
                char c = peek();
                if (c == ' ' || c == '\t' || c == '\r' || c == '\n') next();
                else if (c == '#') skipComment();
                else break;
            }
        }

        void endOfLine() throws TomlException {
            skipSpace();
            skipComment();
            if (end()) return;
            if (peek() == '\r') i++;
            if (end()) return;
            if (peek() != '\n') throw err("expected the end of the line, found '" + peek() + "'");
            next();
        }

        Map<String, Object> document() throws TomlException {
            Map<String, Object> out = new LinkedHashMap<>();
            String table = "";
            java.util.Set<String> tables = new java.util.HashSet<>();
            while (true) {
                skipAll();
                if (end()) break;
                if (peek() == '[') {
                    next();
                    if (peek() == '[') throw err("arrays of tables ([[...]]) are not used in STODD config files");
                    skipSpace();
                    List<String> k = key();
                    skipSpace();
                    if (end() || next() != ']') throw err("expected ']' after the table name");
                    table = String.join(".", k);
                    if (!tables.add(table)) throw err("the table [" + table + "] appears twice");
                    endOfLine();
                    continue;
                }
                List<String> k = key();
                skipSpace();
                if (end() || next() != '=') throw err("expected '=' after the key " + String.join(".", k));
                skipSpace();
                Object v = value();
                String full = (table.isEmpty() ? "" : table + ".") + String.join(".", k);
                if (out.containsKey(full)) throw err("the key " + full + " is set twice");
                out.put(full, v);
                endOfLine();
            }
            return out;
        }

        List<String> key() throws TomlException {
            List<String> parts = new ArrayList<>();
            while (true) {
                skipSpace();
                char c = peek();
                if (c == '"') parts.add(basicString());
                else if (c == '\'') parts.add(literalString());
                else {
                    int a = i;
                    while (!end() && (Character.isLetterOrDigit(peek()) || peek() == '_' || peek() == '-')) i++;
                    if (a == i) throw err(end() ? "unexpected end of the file" : "a key cannot start with '" + c + "'");
                    parts.add(s.substring(a, i));
                }
                skipSpace();
                if (peek() == '.') { i++; continue; }
                return parts;
            }
        }

        Object value() throws TomlException {
            if (end()) throw err("a value is missing");
            char c = peek();
            if (c == '"') return peek(1) == '"' && peek(2) == '"' ? multiBasic() : basicString();
            if (c == '\'') return peek(1) == '\'' && peek(2) == '\'' ? multiLiteral() : literalString();
            if (c == '[') return array();
            if (c == '{') return inlineTable();
            if (s.startsWith("true", i) && !wordChar(peek(4))) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i) && !wordChar(peek(5))) { i += 5; return Boolean.FALSE; }
            return number();
        }

        static boolean wordChar(char c) { return Character.isLetterOrDigit(c) || c == '_' || c == '-'; }

        Object number() throws TomlException {
            int a = i;
            while (!end() && "0123456789abcdefABCDEFxXoO_+-.:TtZz".indexOf(peek()) >= 0) i++;
            if (s.startsWith("inf", i) || s.startsWith("nan", i)) i += 3;
            String t = s.substring(a, i);
            if (t.isEmpty()) throw err("expected a value, found '" + peek() + "' (put text in quotes)");
            String u = t.replace("_", "");
            try {
                if (u.equals("inf") || u.equals("+inf")) return Double.POSITIVE_INFINITY;
                if (u.equals("-inf")) return Double.NEGATIVE_INFINITY;
                if (u.endsWith("nan")) return Double.NaN;
                if (u.startsWith("0x")) return Long.parseLong(u.substring(2), 16);
                if (u.startsWith("0o")) return Long.parseLong(u.substring(2), 8);
                if (u.startsWith("0b")) return Long.parseLong(u.substring(2), 2);
                if (u.matches("[+-]?\\d+")) return Long.parseLong(u.startsWith("+") ? u.substring(1) : u);
                if (u.matches("[+-]?(\\d+)(\\.\\d+)?([eE][+-]?\\d+)?") || u.matches("[+-]?\\d+\\.\\d*") || u.matches("[+-]?\\.\\d+")) return Double.parseDouble(u);
                if (u.matches("\\d{4}-\\d{2}-\\d{2}.*") || u.matches("\\d{2}:\\d{2}.*")) return t;   // a date or time: kept as text
            } catch (NumberFormatException e) { /* fall through */ }
            throw err("'" + t + "' is not a number (text needs quotes, decimals use a dot)");
        }

        String basicString() throws TomlException {
            next();
            StringBuilder b = new StringBuilder();
            while (true) {
                if (end() || peek() == '\n') throw err("a text in \"...\" is not closed on its line");
                char c = next();
                if (c == '"') return b.toString();
                if (c == '\\') escape(b);
                else b.append(c);
            }
        }

        void escape(StringBuilder b) throws TomlException {
            if (end()) throw err("a '\\' at the end of the text");
            char e = next();
            switch (e) {
                case 'b': b.append('\b'); break;
                case 't': b.append('\t'); break;
                case 'n': b.append('\n'); break;
                case 'f': b.append('\f'); break;
                case 'r': b.append('\r'); break;
                case '"': b.append('"'); break;
                case '\\': b.append('\\'); break;
                case 'u': case 'U': {
                    int n = e == 'u' ? 4 : 8;
                    if (i + n > s.length()) throw err("a short \\" + e + " escape");
                    try { b.appendCodePoint(Integer.parseInt(s.substring(i, i + n), 16)); } catch (RuntimeException x) { throw err("a bad \\" + e + " escape"); }
                    i += n;
                    break;
                }
                default: throw err("'\\" + e + "' is not a TOML escape - for a regular expression use 'single quotes', where \\ is kept as it is");
            }
        }

        String literalString() throws TomlException {
            next();
            int a = i;
            while (!end() && peek() != '\'' && peek() != '\n') i++;
            if (end() || peek() != '\'') throw err("a text in '...' is not closed on its line");
            String t = s.substring(a, i);
            i++;
            return t;
        }

        String multiBasic() throws TomlException {
            i += 3;
            if (peek() == '\r') i++;
            if (peek() == '\n') next();
            StringBuilder b = new StringBuilder();
            while (true) {
                if (end()) throw err("a text in \"\"\"...\"\"\" is not closed");
                if (s.startsWith("\"\"\"", i)) { i += 3; return b.toString(); }
                char c = next();
                if (c == '\\') {
                    if (peek() == '\n' || peek() == '\r' || peek() == ' ' || peek() == '\t') { while (!end() && Character.isWhitespace(peek())) next(); }
                    else escape(b);
                } else b.append(c);
            }
        }

        String multiLiteral() throws TomlException {
            i += 3;
            if (peek() == '\r') i++;
            if (peek() == '\n') next();
            int a = i;
            while (!end() && !s.startsWith("'''", i)) next();
            if (end()) throw err("a text in '''...''' is not closed");
            String t = s.substring(a, i);
            i += 3;
            return t;
        }

        List<Object> array() throws TomlException {
            next();
            List<Object> out = new ArrayList<>();
            while (true) {
                skipAll();
                if (end()) throw err("a list [...] is not closed");
                if (peek() == ']') { next(); return out; }
                out.add(value());
                skipAll();
                if (peek() == ',') { next(); continue; }
                if (peek() == ']') { next(); return out; }
                throw err("expected ',' or ']' in a list, found '" + peek() + "'");
            }
        }

        Map<String, Object> inlineTable() throws TomlException {
            next();
            Map<String, Object> out = new LinkedHashMap<>();
            skipAll();
            if (peek() == '}') { next(); return out; }
            while (true) {
                skipAll();
                List<String> k = key();
                skipSpace();
                if (end() || next() != '=') throw err("expected '=' in { ... }");
                skipSpace();
                Object v = value();
                Map<String, Object> at = out;
                for (int q = 0; q < k.size() - 1; q++) {
                    Object sub = at.get(k.get(q));
                    if (!(sub instanceof Map)) { sub = new LinkedHashMap<String, Object>(); at.put(k.get(q), sub); }
                    @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) sub;
                    at = m;
                }
                at.put(k.get(k.size() - 1), v);
                skipAll();
                if (peek() == ',') { next(); continue; }
                if (peek() == '}') { next(); return out; }
                throw err("expected ',' or '}' in { ... }, found '" + peek() + "'");
            }
        }
    }

    // ---------------------------------------------------------------- writing

    static boolean bare(String k) {
        if (k.isEmpty()) return false;
        for (int q = 0; q < k.length(); q++) {
            char c = k.charAt(q);
            if (!(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '_' || c == '-')) return false;
        }
        return true;
    }

    public static String key(String k) { return bare(k) ? k : string(k); }

    public static String string(String v) {
        if (v.indexOf('\\') >= 0 && v.indexOf('\'') < 0 && v.indexOf('\n') < 0 && v.indexOf('\r') < 0) return "'" + v + "'";
        StringBuilder b = new StringBuilder("\"");
        for (int q = 0; q < v.length(); q++) {
            char c = v.charAt(q);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) b.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append('"').toString();
    }

    public static String number(double d) {
        if (Double.isNaN(d)) return "nan";
        if (Double.isInfinite(d)) return d > 0 ? "inf" : "-inf";
        if (d == Math.rint(d) && Math.abs(d) < 1e15) return Long.toString((long) d);
        String t = Double.toString(d);
        if (t.contains("E")) {
            t = t.replace("E", "e");
            if (!t.contains(".")) t = t.replace("e", ".0e");
        }
        return t;
    }

    /** One value, on one line. */
    public static String format(Object v) {
        if (v == null) return "\"\"";
        if (v instanceof Boolean) return v.toString();
        if (v instanceof Long || v instanceof Integer || v instanceof Short || v instanceof Byte) return v.toString();
        if (v instanceof Number) return number(((Number) v).doubleValue());
        if (v instanceof String) return string((String) v);
        if (v instanceof List) {
            StringBuilder b = new StringBuilder("[");
            boolean first = true;
            for (Object o : (List<?>) v) { if (!first) b.append(", "); first = false; b.append(format(o)); }
            return b.append(']').toString();
        }
        if (v instanceof Map) {
            Map<?, ?> m = (Map<?, ?>) v;
            if (m.isEmpty()) return "{}";
            StringBuilder b = new StringBuilder("{ ");
            boolean first = true;
            for (Map.Entry<?, ?> e : m.entrySet()) { if (!first) b.append(", "); first = false; b.append(key(String.valueOf(e.getKey()))).append(" = ").append(format(e.getValue())); }
            return b.append(" }").toString();
        }
        return string(String.valueOf(v));
    }

    /** A value for "key = ...": long lists go over several lines, one element each. */
    public static String formatBlock(Object v, int width) {
        String one = format(v);
        if (!(v instanceof List) || one.length() <= width) return one;
        boolean simple = true;
        for (Object o : (List<?>) v) if (o instanceof List || o instanceof Map) simple = false;
        StringBuilder b = new StringBuilder("[\n");
        if (simple) {
            // short values: as many to a line as fit
            StringBuilder line = new StringBuilder();
            for (Object o : (List<?>) v) {
                String t = format(o) + ",";
                if (line.length() > 0 && line.length() + 1 + t.length() > width) { b.append("  ").append(line).append('\n'); line.setLength(0); }
                if (line.length() > 0) line.append(' ');
                line.append(t);
            }
            if (line.length() > 0) b.append("  ").append(line).append('\n');
        } else {
            for (Object o : (List<?>) v) b.append("  ").append(format(o)).append(",\n");
        }
        return b.append(']').toString();
    }
}

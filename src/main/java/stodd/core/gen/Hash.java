package stodd.core.gen;

/** The scripts' hash3 (40_islands.js), bit for bit: a 32-bit mix of two coordinates and a seed, returned unsigned. */
public final class Hash {
    private Hash() { }

    public static long hash3(int a, int b, int seed) {
        int h = (a * 0x27d4eb2d) ^ (b * 0x165667b1) ^ seed;
        h = (h ^ (h >>> 15)) * 0x85ebca6b;
        h = (h ^ (h >>> 13)) * 0xc2b2ae35;
        return (h ^ (h >>> 16)) & 0xffffffffL;
    }
}

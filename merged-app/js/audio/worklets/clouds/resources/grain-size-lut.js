/**
 * Grain Size Lookup Table
 *
 * Exponential mapping from SIZE parameter (0-1) to grain duration in samples.
 * Ported from Mutable Instruments Clouds resources.cc
 *
 * Usage: interpolate(LUT_GRAIN_SIZE, sizeParam, 256.0)
 * Range: 1024 to 16384 samples (21ms to 341ms @ 48kHz)
 *
 * @constant {Float32Array}
 */
export const LUT_GRAIN_SIZE = new Float32Array([
  1024, 1035, 1046, 1057, 1069, 1080, 1092, 1104,
  1116, 1128, 1141, 1153, 1166, 1178, 1191, 1204,
  1217, 1231, 1244, 1257, 1271, 1285, 1299, 1313,
  1327, 1342, 1357, 1371, 1386, 1401, 1417, 1432,
  1448, 1463, 1479, 1495, 1512, 1528, 1545, 1562,
  1579, 1596, 1613, 1631, 1649, 1667, 1685, 1703,
  1722, 1740, 1759, 1779, 1798, 1817, 1837, 1857,
  1878, 1898, 1919, 1940, 1961, 1982, 2004, 2025,
  2048, 2070, 2092, 2115, 2138, 2161, 2185, 2209,
  2233, 2257, 2282, 2307, 2332, 2357, 2383, 2409,
  2435, 2462, 2488, 2515, 2543, 2571, 2599, 2627,
  2655, 2684, 2714, 2743, 2773, 2803, 2834, 2865,
  2896, 2927, 2959, 2991, 3024, 3057, 3090, 3124,
  3158, 3192, 3227, 3262, 3298, 3334, 3370, 3407,
  3444, 3481, 3519, 3558, 3596, 3635, 3675, 3715,
  3756, 3796, 3838, 3880, 3922, 3965, 4008, 4051,
  4096, 4140, 4185, 4231, 4277, 4323, 4371, 4418,
  4466, 4515, 4564, 4614, 4664, 4715, 4766, 4818,
  4870, 4924, 4977, 5031, 5086, 5142, 5198, 5254,
  5311, 5369, 5428, 5487, 5547, 5607, 5668, 5730,
  5792, 5855, 5919, 5983, 6049, 6114, 6181, 6248,
  6316, 6385, 6455, 6525, 6596, 6668, 6741, 6814,
  6888, 6963, 7039, 7116, 7193, 7271, 7351, 7431,
  7512, 7593, 7676, 7760, 7844, 7930, 8016, 8103,
  8192, 8281, 8371, 8462, 8554, 8648, 8742, 8837,
  8934, 9032, 9131, 9231, 9332, 9435, 9539, 9644,
  9750, 9858, 9967, 10077, 10189, 10302, 10416, 10532,
  10649, 10767, 10888, 11009, 11132, 11257, 11383, 11511,
  11640, 11771, 11904, 12038, 12174, 12312, 12451, 12592,
  12735, 12880, 13026, 13175, 13325, 13477, 13631, 13787,
  13945, 14105, 14267, 14431, 14597, 14765, 14936, 15109,
  15284, 15461, 15640, 15822, 16007, 16194, 16384
]);

/**
 * Linear interpolation helper for LUT access
 * @param {Float32Array} table - Lookup table
 * @param {number} index - Fractional index (0-tableSize)
 * @param {number} tableSize - Size multiplier for indexing
 * @returns {number} Interpolated value
 */
export function interpolate(table, index, tableSize) {
  const scaledIndex = index * tableSize;
  const i = Math.floor(scaledIndex);
  const frac = scaledIndex - i;

  // Clamp to table bounds
  const i0 = Math.max(0, Math.min(table.length - 1, i));
  const i1 = Math.max(0, Math.min(table.length - 1, i + 1));

  return table[i0] + (table[i1] - table[i0]) * frac;
}

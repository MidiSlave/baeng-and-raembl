# DX7 Algorithms Quick Reference

Complete visual reference for all 32 DX7 algorithms with signal flow diagrams.

## Reading the Diagrams

- Numbers represent operators (1-6)
- `→` indicates modulation (operator A → operator B means A modulates B)
- `(output)` indicates a carrier operator that produces audio output
- `||` indicates parallel signal paths that sum together
- Operators are listed top-down (6 at top, 1 at bottom)

---

## Algorithm 1
**Type**: Stacked
**Carriers**: 3, 1
**Structure**: Two parallel stacks (4-op + 2-op)

```
6 → 5 → 4 → 3 (output)
||
2 → 1 (output)
```

**Best for**: Electric piano, split sounds

---

## Algorithm 2
**Type**: Hybrid
**Carriers**: 3, 2, 1
**Structure**: 4-op stack with two carriers

```
6 → 5 → 4 → 3 (output)
||
2 (output)
||
1 (output)
```

**Best for**: Layered textures, three-voice harmony

---

## Algorithm 3
**Type**: Hybrid
**Carriers**: 1
**Structure**: Two stacks modulating one carrier

```
6 → 5 → 4 ─┐
           ├→ 1 (output)
3 → 2 ─────┘
```

**Best for**: Complex bass, brass

---

## Algorithm 4
**Type**: Stacked
**Carriers**: 1
**Structure**: Full 6-operator stack

```
6 → 5 → 4 → 3 → 2 → 1 (output)
```

**Best for**: Complex bass, evolving pads, extreme FM

---

## Algorithm 5
**Type**: Stacked
**Carriers**: 3, 1
**Structure**: 4-op and 2-op stacks

```
6 → 5 → 4 → 3 (output)
||
2 → 1 (output)
```

**Best for**: Electric piano (identical to Algorithm 1)

---

## Algorithm 6
**Type**: Stacked
**Carriers**: 2, 1
**Structure**: 5-op stack with carrier

```
6 → 5 → 4 → 3 → 2 (output)
||
1 (output)
```

**Best for**: Complex lead with pure carrier

---

## Algorithm 7
**Type**: Stacked
**Carriers**: 4, 2, 1
**Structure**: Two stacks plus carrier

```
6 → 5 → 4 (output)
||
3 → 2 (output)
||
1 (output)
```

**Best for**: Three-part harmony, multi-timbral

---

## Algorithm 8
**Type**: Hybrid
**Carriers**: 4, 3, 2, 1
**Structure**: 3-op stack with three carriers

```
6 → 5 → 4 (output)
||
3 (output)
||
2 (output)
||
1 (output)
```

**Best for**: Four-voice harmony, organ-like

---

## Algorithm 9
**Type**: Stacked
**Carriers**: 5, 3, 1
**Structure**: Three 2-op stacks

```
6 → 5 (output)
||
4 → 3 (output)
||
2 → 1 (output)
```

**Best for**: Three simple FM voices

---

## Algorithm 10
**Type**: Hybrid
**Carriers**: 5, 3, 2, 1
**Structure**: Two 2-op stacks and two carriers

```
6 → 5 (output)
||
4 → 3 (output)
||
2 (output)
||
1 (output)
```

**Best for**: Mixed timbres, layered sounds

---

## Algorithm 11
**Type**: Stacked
**Carriers**: 4, 3, 1
**Structure**: 3-op stack, carrier, 2-op stack

```
6 → 5 → 4 (output)
||
3 (output)
||
2 → 1 (output)
```

**Best for**: Three-part textures

---

## Algorithm 12
**Type**: Hybrid
**Carriers**: 5, 4, 3, 1
**Structure**: 2-op stack, carriers, 2-op stack

```
6 → 5 (output)
||
4 (output)
||
3 (output)
||
2 → 1 (output)
```

**Best for**: Four-voice arrangements

---

## Algorithm 13
**Type**: Stacked
**Carriers**: 4, 1
**Structure**: Two 3-op stacks

```
6 → 5 → 4 (output)
||
3 → 2 → 1 (output)
```

**Best for**: Dual timbres, split keyboard

---

## Algorithm 14
**Type**: Stacked
**Carriers**: 5, 1
**Structure**: 2-op and 4-op stacks

```
6 → 5 (output)
||
4 → 3 → 2 → 1 (output)
```

**Best for**: Bass and melody layer

---

## Algorithm 15
**Type**: Stacked
**Carriers**: 5, 4, 1
**Structure**: 2-op stack, carrier, 3-op stack

```
6 → 5 (output)
||
4 (output)
||
3 → 2 → 1 (output)
```

**Best for**: Three-part harmony

---

## Algorithm 16
**Type**: Hybrid
**Carriers**: 6, 5, 4, 1
**Structure**: Three carriers and 3-op stack

```
6 (output)
||
5 (output)
||
4 (output)
||
3 → 2 → 1 (output)
```

**Best for**: Mostly additive with FM bass

---

## Algorithm 17
**Type**: Stacked
**Carriers**: 5, 3, 1
**Structure**: Three 2-op stacks (identical to #9)

```
6 → 5 (output)
||
4 → 3 (output)
||
2 → 1 (output)
```

**Best for**: Three simple FM voices

---

## Algorithm 18
**Type**: Hybrid
**Carriers**: 6, 4, 2, 1
**Structure**: Carrier, two 2-op stacks, carrier

```
6 (output)
||
5 → 4 (output)
||
3 → 2 (output)
||
1 (output)
```

**Best for**: Four-voice with two pure and two FM

---

## Algorithm 19
**Type**: Rooted
**Carriers**: 6, 5, 3, 1
**Structure**: Two carriers with two 2-op stacks

```
6 (output)
||
5 (output)
||
4 → 3 (output)
||
2 → 1 (output)
```

**Best for**: Four-voice with gentle modulation

---

## Algorithm 20
**Type**: Rooted
**Carriers**: 6, 5, 4, 3, 1
**Structure**: Four carriers and 2-op stack

```
6 (output)
||
5 (output)
||
4 (output)
||
3 (output)
||
2 → 1 (output)
```

**Best for**: Mostly additive, slight FM color

---

## Algorithm 21
**Type**: Rooted
**Carriers**: 6, 5, 4, 2, 1
**Structure**: Three carriers, 2-op stack, carrier

```
6 (output)
||
5 (output)
||
4 (output)
||
3 → 2 (output)
||
1 (output)
```

**Best for**: Mostly pure tones with slight FM

---

## Algorithm 22
**Type**: Rooted
**Carriers**: 5, 4, 3, 2, 1
**Structure**: 2-op stack with four carriers

```
6 → 5 (output)
||
4 (output)
||
3 (output)
||
2 (output)
||
1 (output)
```

**Best for**: Bright organ with slight modulation

---

## Algorithm 23
**Type**: Additive
**Carriers**: 6, 5, 4, 3, 2, 1
**Structure**: All carriers (no modulation)

```
6 (output)
||
5 (output)
||
4 (output)
||
3 (output)
||
2 (output)
||
1 (output)
```

**Best for**: Organ, pure additive synthesis

---

## Algorithm 24
**Type**: Branched
**Carriers**: 1
**Structure**: Two 2-op stacks modulating 2-op stack

```
6 → 5 ─┐
       ├→ 2 → 1 (output)
4 → 3 ─┘
```

**Best for**: Complex brass, metallic tones

---

## Algorithm 25
**Type**: Branched
**Carriers**: 1
**Structure**: Three modulators to one carrier

```
6 → 5 ─┐
       │
4 → 3 ─┼→ 1 (output)
       │
2 ─────┘
```

**Best for**: Bright, metallic sounds, bells

---

## Algorithm 26
**Type**: Branched
**Carriers**: 1
**Structure**: Three modulators to 2-op stack

```
6 → 5 ─┐
       │
4 ─────┼→ 2 → 1 (output)
       │
3 ─────┘
```

**Best for**: Complex modulated bass

---

## Algorithm 27
**Type**: Branched
**Carriers**: 1
**Structure**: Four modulators to one carrier

```
6 → 5 ─┐
       │
4 ─────┤
       ├→ 1 (output)
3 ─────│
       │
2 ─────┘
```

**Best for**: Very bright, metallic, inharmonic

---

## Algorithm 28
**Type**: Branched
**Carriers**: 1
**Structure**: Four carriers modulating 2-op stack

```
6 ─┐
   │
5 ─┤
   ├→ 2 → 1 (output)
4 ─│
   │
3 ─┘
```

**Best for**: Rich, complex brass

---

## Algorithm 29
**Type**: Branched
**Carriers**: 1
**Structure**: Five modulators to one carrier

```
6 ─┐
   │
5 ─┤
   │
4 ─┼→ 1 (output)
   │
3 ─┤
   │
2 ─┘
```

**Best for**: Extreme FM, metallic percussion

---

## Algorithm 30
**Type**: Stacked
**Carriers**: 3, 1
**Structure**: 4-op stack and 2-op stack

```
6 → 5 → 4 → 3 (output)
||
2 → 1 (output)
```

**Best for**: Electric piano (identical to #1 and #5)

---

## Algorithm 31
**Type**: Branched
**Carriers**: 1
**Structure**: Two 2-op stacks and modulator to carrier

```
6 → 5 ─┐
       │
4 → 3 ─┼→ 1 (output)
       │
2 ─────┘
```

**Best for**: Complex brass, FM bass

---

## Algorithm 32
**Type**: Additive
**Carriers**: 6, 5, 4, 3, 2, 1
**Structure**: All independent carriers

```
6 (output)
||
5 (output)
||
4 (output)
||
3 (output)
||
2 (output)
||
1 (output)
```

**Best for**: Organ, Hammond-style tones

---

## Summary Statistics

### By Category
- **Stacked**: 11 algorithms (1, 4, 5, 6, 7, 9, 11, 13, 14, 15, 30)
- **Branched**: 7 algorithms (24, 25, 26, 27, 28, 29, 31)
- **Rooted**: 4 algorithms (19, 20, 21, 22)
- **Additive**: 2 algorithms (23, 32)
- **Hybrid**: 8 algorithms (2, 3, 8, 10, 12, 16, 17, 18)

### By Carrier Count
- **1 carrier**: 10 algorithms (3, 4, 24, 25, 26, 27, 28, 29, 31)
- **2 carriers**: 4 algorithms (1, 5, 6, 13, 14, 30)
- **3 carriers**: 5 algorithms (2, 7, 9, 11, 15, 17)
- **4 carriers**: 5 algorithms (8, 10, 12, 16, 18, 19)
- **5 carriers**: 3 algorithms (20, 21, 22)
- **6 carriers**: 2 algorithms (23, 32)

### Recommended Starting Algorithms
- **Beginners**: 23, 32 (all carriers, no FM complexity)
- **Classic FM**: 1, 5, 30 (electric piano algorithms)
- **Experimental**: 29 (extreme modulation), 4 (full stack)
- **Brass/Bells**: 25, 27, 28 (branched algorithms)

---

## Modulation Depth Guidelines

For each algorithm type, here are suggested modulation index ranges:

### Stacked Algorithms (1-15, 30)
- Light modulation: 50-200
- Medium modulation: 200-800
- Heavy modulation: 800-2000

### Branched Algorithms (24-29, 31)
- Light modulation: 100-400
- Medium modulation: 400-1200
- Heavy modulation: 1200-3000

### Additive Algorithms (23, 32)
- No modulation (carriers only)
- Adjust carrier levels for harmonic balance

### Rooted Algorithms (19-22)
- Light modulation: 50-150
- Medium modulation: 150-500
- Heavy modulation: 500-1000

---

## Performance Notes

**CPU Usage** (highest to lowest):
1. Algorithm 29 (5 modulators, complex routing)
2. Algorithm 4 (full stack, deep modulation chain)
3. Branched algorithms (24-28, 31)
4. Stacked algorithms (1-15)
5. Rooted algorithms (19-22)
6. Additive algorithms (23, 32) - most efficient

**Memory Usage**: All algorithms use equal memory (6 operators + connections)

**Latency**: No significant difference between algorithms in Web Audio implementation

---

## Common Use Cases

### Electric Piano
- **Algorithms**: 1, 5, 30
- **Operator ratios**: 1:1, 1:2, 1:4 for harmonic stacks
- **Modulation**: Medium (200-600)

### Bass
- **Algorithms**: 3, 4, 26, 31
- **Operator ratios**: 1:1, 1:0.5 for sub-bass
- **Modulation**: Heavy (800-2000)

### Pads
- **Algorithms**: 13, 14, 16, 23
- **Operator ratios**: Harmonic or slightly detuned
- **Modulation**: Light to medium (100-500)

### Bells/Metallic
- **Algorithms**: 25, 27, 29
- **Operator ratios**: Non-integer (1.41, 2.73, 3.14)
- **Modulation**: Medium to heavy (500-2000)

### Brass
- **Algorithms**: 24, 28, 31
- **Operator ratios**: Harmonic series (1:2:3:4)
- **Modulation**: Medium (400-1200)

### Organ
- **Algorithms**: 23, 32
- **Operator ratios**: Harmonic series (drawbar emulation)
- **Modulation**: None (pure additive)

---

## Further Reading

- `algorithms.js` - Complete JavaScript implementation
- `ALGORITHMS_README.md` - Detailed documentation with code examples
- Original DX7 manual - Yamaha Corporation
- "The Theory and Technique of Electronic Music" by Miller Puckette

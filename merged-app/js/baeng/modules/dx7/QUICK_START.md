# DX7 Algorithms Quick Start Guide

## What You Have

A complete implementation of all 32 DX7 algorithms with Web Audio API integration.

## 5-Minute Quick Start

### 1. Basic Algorithm Lookup
```javascript
const algorithms = require('./algorithms.js');

// Get algorithm configuration
const algo1 = algorithms.getAlgorithm(1);
console.log(algo1.carriers);      // [3, 1] - these produce sound
console.log(algo1.connections);   // [[6,5], [5,4], [4,3], [2,1]] - modulation paths
```

### 2. Play a Sound (Browser)
```html
<script src="algorithms.js"></script>
<script src="web-audio-example.js"></script>
<script>
  // Create audio context
  const ctx = new AudioContext();

  // Create voice with electric piano algorithm
  const voice = new DX7Voice(ctx, 1);
  DX7Presets.electricPiano(voice);

  // Play A4 (440Hz)
  voice.setFrequency(440);
  voice.connect(ctx.destination);
  voice.start();

  // Stop after 2 seconds
  setTimeout(() => voice.stop(), 2000);
</script>
```

### 3. Build Custom Sound
```javascript
const ctx = new AudioContext();
const voice = new DX7Voice(ctx, 4); // Full stack algorithm

// Configure operators (1-6)
voice.setOperatorRatio(6, 2.0);        // Op 6 at 2x frequency
voice.setOperatorModulation(6, 800);   // Heavy modulation
voice.setOperatorLevel(6, 1.0);        // Full level

// Play it
voice.setFrequency(220);
voice.connect(ctx.destination);
voice.start();
```

## Algorithm Cheat Sheet

### Electric Piano → Use Algorithm 1
```javascript
// Two stacks: 6→5→4→3 and 2→1
const voice = new DX7Voice(ctx, 1);
DX7Presets.electricPiano(voice);
```

### Bass → Use Algorithm 4
```javascript
// Full stack: 6→5→4→3→2→1
const voice = new DX7Voice(ctx, 4);
DX7Presets.fmBass(voice);
```

### Bell → Use Algorithm 27
```javascript
// Five modulators → one carrier
const voice = new DX7Voice(ctx, 27);
DX7Presets.bell(voice);
```

### Organ → Use Algorithm 32
```javascript
// All carriers (additive)
const voice = new DX7Voice(ctx, 32);
DX7Presets.organ(voice);
```

### Brass → Use Algorithm 28
```javascript
// Four carriers → 2-op stack
const voice = new DX7Voice(ctx, 28);
DX7Presets.brass(voice);
```

## Understanding the Numbers

### Operators (1-6)
- **6** = Top of signal chain (often modulates others)
- **1** = Bottom of signal chain (often the final carrier)

### Carriers vs Modulators
- **Carrier** = Makes sound you hear (connects to output)
- **Modulator** = Changes other operators' frequencies (FM)

### Connections [A, B]
- **[6, 5]** means "operator 6 modulates operator 5"
- **[5, 4]** means "operator 5 modulates operator 4"
- Chain example: 6→5→4 = [[6,5], [5,4]]

## Common Patterns

### Stack (Serial)
```
6 → 5 → 4 → 3 (carrier)
```
Creates rich FM timbres. More operators = more complex sound.

### Branch (Parallel to Single)
```
6 ─┐
5 ─┼→ 1 (carrier)
4 ─┘
```
Multiple modulators create bright, metallic sounds.

### Additive (All Carriers)
```
6 (carrier)
5 (carrier)
4 (carrier)
3 (carrier)
2 (carrier)
1 (carrier)
```
Pure additive synthesis, organ-like.

## Key Parameters

### Frequency Ratio
Controls harmonic relationship:
- **1.0** = Same as base frequency
- **2.0** = One octave up
- **0.5** = One octave down
- **1.41** = Non-harmonic (good for bells)

```javascript
voice.setOperatorRatio(6, 2.0); // Operator 6 at 2x frequency
```

### Modulation Index
Controls FM intensity:
- **0-200** = Subtle coloring
- **200-1000** = Rich FM sound
- **1000+** = Extreme, metallic

```javascript
voice.setOperatorModulation(6, 500); // Moderate FM
```

### Operator Level
Controls volume (0.0 to 1.0):
```javascript
voice.setOperatorLevel(3, 0.8); // 80% volume
```

## Testing Your Setup

Run the test suite:
```bash
node algorithms-test.js
```

Should see: "All tests completed successfully!"

## Troubleshooting

### No Sound?
1. Check audio context state: `audioContext.state === 'running'`
2. Start audio context: `audioContext.resume()`
3. Check master level: `voice.setMasterLevel(0.5)`

### Wrong Sound?
1. Verify algorithm number (1-32)
2. Check operator ratios (harmonic vs non-harmonic)
3. Adjust modulation index (higher = brighter)

### Too Loud/Soft?
```javascript
voice.setMasterLevel(0.3);  // Reduce master volume
```

## Next Steps

1. **Try all algorithms**: Loop through 1-32 to hear differences
2. **Experiment with ratios**: Try harmonic (1, 2, 3, 4) vs inharmonic (1.41, 2.73, 3.14)
3. **Adjust modulation**: Start with 0, increase until you hear FM effect
4. **Read full docs**: See `ALGORITHMS_README.md` for complete guide

## File Reference

- **algorithms.js** - Core data structure
- **web-audio-example.js** - Complete implementation
- **algorithms-test.js** - Test suite
- **ALGORITHMS_README.md** - Full documentation
- **ALGORITHMS_REFERENCE.md** - Visual diagrams
- **IMPLEMENTATION_SUMMARY.md** - Project overview

## Example: Complete Setup

```javascript
// 1. Create context
const ctx = new AudioContext();

// 2. Create voice
const voice = new DX7Voice(ctx, 1);

// 3. Configure operators
voice.setOperatorRatio(6, 14.0);      // Bright modulator
voice.setOperatorModulation(6, 300);  // Medium FM
voice.setOperatorLevel(6, 1.0);

voice.setOperatorRatio(5, 1.0);       // Fundamental
voice.setOperatorModulation(5, 500);
voice.setOperatorLevel(5, 0.8);

// 4. Set frequency and play
voice.setFrequency(440);
voice.connect(ctx.destination);
voice.start();

// 5. Stop and clean up
setTimeout(() => {
  voice.stop();
  voice.dispose();
}, 2000);
```

## Tips

- **Start simple**: Try algorithm 23 (all carriers) first
- **Add complexity**: Move to algorithm 1 (classic E.Piano)
- **Go extreme**: Try algorithm 29 (5 modulators) for metallic sounds
- **Use presets**: Start with `DX7Presets` to hear good sounds
- **Tweak gradually**: Change one parameter at a time

## Resources

- Original DX7 manual: [Yamaha DX7 Documentation](https://www.chipple.net/dx7/)
- FM synthesis theory: John Chowning's papers
- Web Audio API: [MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

**You're ready to create DX7 sounds!** Start with the presets, then experiment with parameters. Check `ALGORITHMS_README.md` for deeper understanding.

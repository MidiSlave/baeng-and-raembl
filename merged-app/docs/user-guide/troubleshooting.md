# Troubleshooting

This guide provides solutions to common issues you may encounter whilst using Bæng & Ræmbl.

---

## Table of Contents

1. [No Sound](#no-sound)
2. [Audio Glitches and Dropouts](#audio-glitches-and-dropouts)
3. [MIDI Issues](#midi-issues)
4. [Sample Loading Issues](#sample-loading-issues)
5. [Browser Compatibility](#browser-compatibility)
6. [Known Issues](#known-issues)
7. [Getting Help](#getting-help)

---

## No Sound

If you're not hearing any audio output, work through these steps:

### 1. Check Browser Compatibility

Ensure you're using a supported browser:

- **Chrome/Edge**: Version 90 or later (recommended)
- **Firefox**: Version 88 or later
- **Safari**: Version 14 or later

Older browsers may have incomplete Web Audio API support.

### 2. Resume Audio Context

Modern browsers require user interaction before starting audio playback. This is a security feature to prevent autoplay.

**Solution:**
- **Click anywhere on the page** or press the **Space bar**
- You should see the interface fully loaded
- Check the browser console (F12) for "AudioContext resumed" message

If the AudioContext is suspended:
- Click the play button
- Interact with any fader or control
- Press a key on the virtual keyboard

### 3. Check System Volume

Verify your system audio isn't muted:

- **macOS**: Check the volume slider in the menu bar
- **Windows**: Check the volume mixer (right-click the speaker icon)
- **Linux**: Check your audio mixer (varies by distribution)

Also check:
- Your browser's volume isn't muted (some browsers have per-tab mute)
- Your audio output device is correctly selected
- Headphones/speakers are properly connected

### 4. Check Master Levels

Look for the master level meters in each app:

- **Bæng**: Master level meter on the right side of the drum machine
- **Ræmbl**: Master level meter on the right side of the synthesiser

**If meters show no signal:**
- Ensure at least one voice is active
- Check individual voice levels aren't at 0
- Verify the pattern has active steps (Bæng) or notes are being played (Ræmbl)

**If meters show signal but no sound:**
- This indicates an audio routing issue
- Check your browser's audio output settings
- Try refreshing the page
- Check if other browser tabs are playing audio successfully

### 5. Check Engine-Specific Settings

#### Bæng (Drum Machine)

- **DX7/ANLG Engines**: Should produce sound immediately
- **SMPL Engine**: Requires sample banks to load (see [Sample Loading Issues](#sample-loading-issues))
- **SLICE Engine**: Requires slice configuration and buffer loading

**Quick Test:**
1. Select voice T1
2. Switch to **ANLG** engine
3. Click step 1 in the sequencer
4. Press Play
5. You should hear a kick drum

#### Ræmbl (Synthesiser)

- **SUB Engine**: Default subtractive synthesiser, should work immediately
- **PLT Engine**: Plaits multi-engine, requires AudioWorklet support
- **RNG Engine**: Rings resonator, requires AudioWorklet support

**Quick Test:**
1. Ensure **SUB** engine is selected
2. Set **CUTOFF** fader to middle position
3. Set **LEVEL** fader to middle position
4. Click a key on the virtual keyboard
5. You should hear a tone

### 6. Check HTTPS/Localhost Requirement

Web Audio API requires a **secure context** (HTTPS or localhost):

- ✅ `https://midislave.github.io/baeng-and-raembl/`
- ✅ `http://localhost:8080`
- ❌ `http://192.168.1.100:8080` (not secure)

**If serving locally:**
```bash
# Use a local server with HTTPS or localhost
python3 -m http.server 8080  # Access via http://localhost:8080
```

### 7. Disable Browser Extensions

Some browser extensions can interfere with Web Audio API:

- Ad blockers
- Privacy extensions
- Script blockers

**Solution:**
- Try loading the app in an incognito/private window
- Temporarily disable extensions one by one
- Whitelist the app's URL if necessary

---

## Audio Glitches and Dropouts

If you're experiencing crackling, popping, or dropouts in the audio:

### 1. Close Other Browser Tabs

Web Audio API shares CPU resources with other tabs.

**Solution:**
- Close unnecessary browser tabs
- Close other applications using audio (Spotify, YouTube, etc.)
- Check your browser's task manager (Shift+Esc in Chrome) for high CPU usage

### 2. Reduce Polyphony

Ræmbl has an **8-voice polyphony limit**. Exceeding this causes voice stealing, which can create audible artefacts.

**Symptoms:**
- Notes cutting off unexpectedly
- Clicking sounds when playing chords
- Audio dropouts in POLY mode

**Solutions:**
- Play fewer simultaneous notes
- Use **MONO** mode for monophonic patches
- Reduce the number of active sequencer steps
- Simplify complex modulation routings

### 3. Optimise Effect Settings

Some effects are CPU-intensive, particularly at high quality settings.

#### Clouds Granular Processor

**Most CPU-intensive modes:**
- **Granular**: 64-grain engine with window morphing
- **Spectral**: Phase vocoder FFT processing

**Solutions:**
- Switch to **WSOLA** or **Looping Delay** modes (less intensive)
- Use **Classic** FX mode (reverb/delay) instead of Clouds
- In Bæng, select a lower Clouds quality preset:
  - **XLO** (extra low) - minimal CPU usage
  - **LO** (low) - reduced quality but stable
  - **MED** (medium) - balanced
  - **HI** (high) - maximum quality, highest CPU

#### Reverb and Delay

**Solutions:**
- Reduce reverb **SIZE** parameter
- Lower delay **FEEDBACK** (prevents runaway feedback loops)
- Reduce **DRY/WET** mix (less effect processing)

### 4. Disable Per-Parameter Modulation

PPMod runs at 30 FPS on the main thread. Multiple active modulations can add overhead.

**Solutions:**
- Reduce the number of active PPMod assignments
- Use simpler modulation modes (LFO/ENV instead of SEQ/TM)
- Disable modulations you're not actively using

### 5. Check CPU Usage

Use your browser's task manager to monitor CPU usage:

- **Chrome/Edge**: Shift+Esc → Task Manager
- **Firefox**: about:performance
- **Safari**: Activity Monitor (macOS)

**Acceptable CPU usage:**
- < 30%: Optimal performance
- 30-60%: May experience occasional glitches
- > 60%: High risk of dropouts

**Solutions:**
- Close background applications
- Restart your browser
- Use a desktop computer instead of a laptop (better cooling)

### 6. Audio Buffer Size

Some browsers allow adjusting audio buffer size in settings:

- Larger buffer = more latency, fewer glitches
- Smaller buffer = less latency, more CPU strain

**For Chrome:**
- Navigate to `chrome://flags`
- Search for "WebAudio"
- Adjust buffer size if available

### 7. Hardware Acceleration

Ensure hardware acceleration is enabled in your browser:

**Chrome/Edge:**
1. Settings → Advanced → System
2. Enable "Use hardware acceleration when available"
3. Restart browser

**Firefox:**
1. Settings → General → Performance
2. Uncheck "Use recommended performance settings"
3. Check "Use hardware acceleration when available"

---

## MIDI Issues

If your MIDI controller isn't working:

### 1. Check Browser Support

**Web MIDI API support:**
- ✅ Chrome 43+ (full support)
- ✅ Edge 79+ (full support)
- ⚠️ Firefox (requires `dom.webmidi.enabled` flag in `about:config`)
- ❌ Safari (limited/no support)

**Recommended:** Use Chrome or Edge for MIDI functionality.

### 2. Grant MIDI Permissions

Browsers require permission to access MIDI devices.

**When first connecting a MIDI device:**
1. You'll see a permission prompt in the browser
2. Click **Allow** to grant access
3. If you accidentally denied permission:
   - Chrome: Click the 🔒 icon in the address bar → Site Settings → MIDI
   - Reset permissions and reload the page

### 3. Reconnect Your Device

**Physical connection issues:**
1. Unplug your MIDI controller
2. Wait 5 seconds
3. Plug it back in
4. Refresh the browser page
5. Check if the device appears in the MIDI input dropdown (Settings panel)

### 4. Check MIDI Settings

**In the Ræmbl Settings panel:**
1. Click the **gear icon** in the time strip
2. Look for **MIDI Input Select** dropdown
3. Verify your controller is listed
4. Select it from the dropdown (or choose "All Devices")

**If no devices are listed:**
- Ensure the controller is powered on
- Check USB/MIDI cable connections
- Try a different USB port
- Test the controller with another MIDI application

### 5. MIDI Channel Configuration

Some controllers send on specific MIDI channels (1-16).

**Solution:**
- Set the MIDI input to **"All Devices (Notes/CC)"** to receive on all channels
- Or configure your controller to send on channel 1
- Check your controller's manual for channel settings

### 6. MIDI Learn Not Working

**If MIDI Learn mode isn't detecting CC messages:**
1. Click the **Learn** button (should say "Learning...")
2. Move a knob/fader on your controller
3. You should see "Learned CC XX (Ch X)"

**If nothing happens:**
- Ensure your controller is sending CC messages (not NRPN or SysEx)
- Check that the controller isn't in a special mode (some have "MIDI Mode" vs "HUI Mode")
- Try a different knob/fader
- Check the browser console for MIDI message logs

### 7. MIDI Note Input Issues

**Notes not triggering:**
- Verify the controller is selected in MIDI Input dropdown
- Check if notes are triggering in MONO vs POLY mode (behaviour differs)
- Try the virtual keyboard to confirm Ræmbl is working
- Check MIDI velocity (some controllers default to velocity 0)

**Stuck notes:**
- Press **Space** to stop transport (releases all voices)
- Refresh the page if notes remain stuck
- This can happen if Note Off messages are lost

---

## Sample Loading Issues

If samples aren't loading correctly in Bæng's SMPL or SLICE engines:

### 1. Sample Bank Loading

**SMPL engine uses per-voice sample banks:**
- Each voice can load an independent bank
- Banks are loaded from the `samples/` directory
- Loading happens in the background

**Check loading status:**
- Open the browser console (F12)
- Look for `[Sampler]` log messages
- You should see "Loading bank X for voice Y"

**If samples fail to load:**
- Ensure you're running from a web server (not file:// protocol)
- Check that `samples/` directory exists and contains `.wav` files
- Verify network connection (if loading from remote server)
- Check browser console for 404 errors

### 2. Network Issues

**If loading from GitHub Pages:**
- Check your internet connection
- Try refreshing the page
- Clear browser cache (Ctrl+Shift+Del)
- Check if GitHub Pages is accessible

**If loading locally:**
- Ensure the `samples/` directory is in the correct location
- Use a local web server (not file:// URLs):
  ```bash
  # Python 3
  python3 -m http.server 8080

  # Node.js
  npx http-server -p 8080
  ```

### 3. Corrupted Sample Files

**Symptoms:**
- Sample loads but produces no sound
- Console shows "Failed to decode audio buffer"

**Solutions:**
- Verify `.wav` files are valid (open in an audio editor)
- Ensure samples are in a supported format:
  - ✅ WAV (16-bit or 24-bit PCM)
  - ✅ 44.1kHz or 48kHz sample rate
  - ❌ MP3 (not recommended, may have decoding issues)
  - ❌ Compressed formats (FLAC, etc.)

### 4. SLICE Engine Issues

**Slices not loading:**
- SLICE engine requires both buffer loading AND slice configuration
- Check that slice markers are set correctly
- Verify the slice decay parameter is > 0

**Decay too short:**
- SLICE decay is calculated as **percentage of slice length**
- If slices are very short, increase the decay parameter
- Range: 10%-110% of slice duration

### 5. Memory Issues

**If loading many large samples:**
- Each sample bank can be several megabytes
- 6 voices × 128 samples = potentially 768 samples in memory
- Check browser memory usage in task manager

**Solutions:**
- Use shorter samples
- Reduce sample bit depth (16-bit instead of 24-bit)
- Use lower sample rates (44.1kHz instead of 96kHz)
- Reload the page to clear sample cache

---

## Browser Compatibility

### Recommended Browsers

| Browser | Version | Support Level | Notes |
|---------|---------|---------------|-------|
| Chrome | 90+ | ✅ Full | Recommended, best performance |
| Edge | 90+ | ✅ Full | Chromium-based, same as Chrome |
| Firefox | 88+ | ⚠️ Partial | MIDI requires flag, slower AudioWorklet |
| Safari | 14+ | ⚠️ Partial | Limited MIDI support, some bugs |

### Known Browser-Specific Issues

#### Safari

- **MIDI**: Web MIDI API not fully supported
- **AudioWorklet**: Some Plaits/Rings engines may glitch
- **Audio Context**: Requires explicit user interaction to resume
- **Solution**: Use Chrome or Edge for full functionality

#### Firefox

- **MIDI**: Requires enabling `dom.webmidi.enabled` in `about:config`
- **AudioWorklet**: Slower performance than Chrome
- **Solution**: Use Chrome for better performance, especially with Plaits/Rings

#### Mobile Browsers (iOS/Android)

- ❌ **Not officially supported**
- Many features require desktop-class performance
- AudioWorklet may not work correctly
- Touch controls are not optimised for faders
- **Solution**: Use a desktop/laptop computer

### iPad Landscape Mode

- Known UI alignment/positioning issues
- Some modules may overlap or misalign
- **Workaround**: Use portrait mode or rotate to portrait temporarily
- Full fix planned for future release

### JavaScript Required

The synthesiser runs entirely in JavaScript using Web Audio API.

**If JavaScript is disabled:**
- The app will not load
- You'll see a blank page
- Enable JavaScript in browser settings

---

## Known Issues

These are documented issues currently under investigation:

### Sidechain Ducking Artefacts

**Symptoms:**
- Audible clicks or pops when ducking is active
- Unnatural compression artefacts

**Status:** Under investigation
**Workaround:** Reduce ducking amount or disable sidechain

### DX7 Legato/Slide

**Symptoms:**
- Slide parameter doesn't work with DX7 engine
- Legato mode not implemented

**Status:** Planned for future release
**Workaround:** Use ANLG engine for slide functionality

### iPad Landscape Layout

**Symptoms:**
- Modules overlap or misalign
- Faders positioned incorrectly
- Touch targets too small

**Status:** UI polish needed
**Workaround:** Use desktop browser or iPad portrait mode

### Voice Stealing Artefacts (Ræmbl POLY Mode)

**Symptoms:**
- Clicks when new notes steal old voices
- Unexpected note cutoffs in complex polyphonic passages

**Status:** Improved in recent versions, some edge cases remain
**Workaround:**
- Reduce polyphonic complexity (play fewer simultaneous notes)
- Use MONO mode for monophonic patches
- Ensure release envelopes are short (< 500ms)

### Clouds Feedback Loop

**Symptoms:**
- Runaway feedback when **FB** (feedback) and **VERB** (reverb) are both high
- Audio overload/distortion

**Status:** Monitoring, validation system in place
**Workaround:**
- Keep feedback < 90% when reverb > 70%
- Reset Clouds parameters if feedback loop occurs
- Check browser console for stability warnings

---

## Getting Help

If you've worked through this guide and still have issues:

### 1. Check the Documentation

- **[Getting Started](getting-started.md)** - Basic usage guide
- **[Bæng User Guide](baeng-guide.md)** - Drum machine documentation
- **[Ræmbl User Guide](raembl-guide.md)** - Synthesiser documentation

### 2. Browser Console Logs

Before reporting an issue, check the browser console:

1. Press **F12** to open Developer Tools
2. Click the **Console** tab
3. Look for error messages (red text)
4. Copy any relevant errors for reporting

### 3. Report a Bug

Open an issue on GitHub with the following information:

**Issue Template:**
```
**Browser:** Chrome 120 / Firefox 115 / Safari 16 / etc.
**OS:** macOS 14.1 / Windows 11 / Ubuntu 22.04 / etc.
**Issue:** Clear description of the problem
**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Expected vs actual behaviour

**Console Errors:** (paste any console errors here)
```

**GitHub Issues:** [https://github.com/MidiSlave/baeng-and-raembl/issues](https://github.com/MidiSlave/baeng-and-raembl/issues)

### 4. Feature Requests

Have an idea for improvement? Open a feature request on GitHub:

**GitHub Issues:** [https://github.com/MidiSlave/baeng-and-raembl/issues](https://github.com/MidiSlave/baeng-and-raembl/issues)

Use the label **"enhancement"** for feature requests.

---

## Emergency Reset

If the app is completely broken and won't load:

### Clear Browser Data

1. Open browser settings
2. Navigate to Privacy/Clear browsing data
3. Select:
   - ✅ Cookies and site data
   - ✅ Cached images and files
   - ✅ Local storage
4. Select **"All time"** as time range
5. Clear data
6. Reload the app

**Note:** This will reset all saved patches and settings in localStorage.

### Hard Refresh

Force the browser to reload all assets:

- **Windows/Linux:** Ctrl+Shift+R
- **macOS:** Cmd+Shift+R

### Safe Mode Test

Test in incognito/private mode to rule out extension conflicts:

- **Chrome:** Ctrl+Shift+N (Windows) / Cmd+Shift+N (macOS)
- **Firefox:** Ctrl+Shift+P (Windows) / Cmd+Shift+P (macOS)
- **Safari:** File → New Private Window

---

**Still having issues?** Open an issue on [GitHub](https://github.com/MidiSlave/baeng-and-raembl/issues) with detailed information about your problem.

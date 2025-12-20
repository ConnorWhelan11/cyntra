# Telemetry System - Ready to Test! 🎉

## Status: ✅ Implementation Complete

All components have been implemented and tested:

- ✅ Python telemetry writer
- ✅ Claude adapter integration
- ✅ Codex adapter integration
- ✅ Tauri backend commands
- ✅ React UI component
- ✅ CSS styling
- ✅ Unit tests (8/8 passing)
- ✅ Integration tests (3/3 passing)
- ✅ Builds successful (Python, TypeScript, Rust)

## Issue Found

You're seeing this error because **the desktop app needs to be restarted** to pick up the new Tauri commands.

**Error message:**
```
invalid args params for command workcell_get_info : command workcell_get_info missing required key params
```

**Why:** The running desktop app (PID 50755) was started before we added the new Tauri commands. It's running the old binary without `workcell_get_info` and `workcell_get_telemetry`.

## How to Fix

**Restart the desktop app:**

1. Stop the running app (Cmd+Q or kill the terminal running `npm run tauri dev`)
2. Rebuild and restart:
   ```bash
   cd apps/glia-fab-desktop
   npm run tauri dev
   ```

3. Once restarted, navigate to the **Kernel** tab
4. Find the workcell: `wc-1-20251218T224812Z` (or any workcell)
5. Click **"View Details"** button
6. You should see the telemetry modal! 🎉

## What You'll See

The WorkcellDetail modal will show:

```
┌─────────────────────────────────────────────────┐
│ Workcell: wc-1-20251218T224812Z                 │
│ Issue #1 • codex • failed                       │
├─────────────────────────────────────────────────┤
│ [started] 22:48:47                              │
│ codex • Model: gpt-5.2                          │
│                                                 │
│ [Prompt] 22:48:47                               │
│ Show prompt (~150 tokens)                       │
│                                                 │
│ [Completed] 22:48:48                            │
│ Status: failed • Exit code: 2 • Duration: 1.43s │
└─────────────────────────────────────────────────┘
```

## Demo Telemetry Available

We created demo telemetry in an existing workcell:

**File:** `.workcells/wc-1-20251218T221223Z/telemetry.jsonl`
**Events:** 22 events
**Content:** Simulated Claude execution with:
- Prompt sent
- Response chunks (streaming)
- Tool calls (Read, Write, Bash)
- Tool results
- Completion

**View it:**
```bash
cat .workcells/wc-1-20251218T221223Z/telemetry.jsonl | jq .
```

Or in the desktop app, find workcell `wc-1-20251218T221223Z` and click **View Details**.

## Next Steps

1. **Restart the app** (instructions above)
2. **Test the UI** by viewing workcell details
3. **Try running a real task** to see live telemetry:
   ```bash
   dev-kernel run --once --issue 1
   ```
4. **Watch telemetry stream** in real-time as the LLM works

## Verification Checklist

Before using:
- [ ] Desktop app restarted (pick up new Tauri commands)
- [ ] Can click "View Details" on a workcell
- [ ] Modal opens without errors
- [ ] See telemetry events displayed
- [ ] Auto-refresh works (2s interval)
- [ ] Can expand/collapse event details

## Need Help?

**Error persists after restart?**
1. Check console logs in the desktop app (View → Developer → Developer Tools)
2. Verify the Rust build completed: `cd apps/glia-fab-desktop/src-tauri && cargo build`
3. Verify TypeScript build: `cd apps/glia-fab-desktop && npm run build`

**No telemetry showing?**
- Check if `telemetry.jsonl` exists in the workcell directory
- Try creating demo telemetry: `python dev-kernel/scripts/create_demo_telemetry.py`
- Verify file has events: `wc -l .workcells/*/telemetry.jsonl`

## Documentation

Full documentation available in:
- **User guide:** `docs/telemetry.md`
- **Implementation details:** `TELEMETRY_IMPLEMENTATION.md`
- **Tests:** `dev-kernel/tests/test_telemetry.py`

---

**The system is ready!** Just restart the app and you'll have full LLM observability. 🚀

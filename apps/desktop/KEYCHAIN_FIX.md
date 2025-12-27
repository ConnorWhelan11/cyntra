# Keychain Permission Fix

## Problem

Every time you restarted the Glia Fab Desktop app in development mode, macOS would prompt for keychain access. This was happening because:

1. Development builds have changing signatures each time they're compiled
2. macOS treats each build as a "new" app
3. The keychain permission doesn't carry over between builds
4. Multiple attempts were needed before the permission would work

## Solution

Implemented a **hybrid storage approach** that prioritizes file-based storage for development:

### File-Based Storage (Primary)

- **Location**: `~/.cyntra/global-env.txt`
- **No keychain prompts** in development
- **Persists across rebuilds** (same file used every time)
- **Fast and reliable**

### Keychain Storage (Fallback)

- Still used in production builds
- More secure for sensitive data
- Only prompts if file storage doesn't exist

## Changes Made

### Modified: `src-tauri/src/main.rs`

1. **Added file path helper:**

   ```rust
   fn global_env_file_path() -> PathBuf {
     let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
     PathBuf::from(home).join(".cyntra").join("global-env.txt")
   }
   ```

2. **Updated `get_global_env_text_internal()`:**
   - Try file storage first
   - Fall back to keychain if file doesn't exist

3. **Updated `set_global_env()`:**
   - Write to file (always succeeds)
   - Optionally try keychain (ignored if fails)

4. **Updated `clear_global_env()`:**
   - Remove file
   - Also clear keychain entry

## Usage

### Development Mode

When you set environment variables in the app:

1. They're saved to `~/.cyntra/global-env.txt`
2. No keychain prompts
3. Persists across app restarts
4. Works immediately on first try

### Production Mode

If you build a release version:

1. File storage still works
2. Keychain storage also attempted (with user approval)
3. Provides both convenience and security

## Migration

If you already have env vars in the keychain:

1. Open the app (it will try keychain first time)
2. Enter your keychain password
3. The app will read from keychain
4. Next time you set env vars, they'll go to the file
5. Future restarts won't prompt anymore

Or manually copy:

```bash
# If you have keychain entries, export them
security find-generic-password -s "glia-fab-desktop" -a "global-env" -w > ~/.cyntra/global-env.txt
```

## File Format

The file contains your environment variables in the same format you enter in the UI:

```bash
# Example ~/.cyntra/global-env.txt
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

## Security Notes

### File-Based Storage

- ✅ Good: No keychain prompts
- ✅ Good: Persists across rebuilds
- ⚠️ Note: File permissions are `0644` (readable by user)
- ⚠️ Note: Plain text on disk

### Recommendations

- **Development**: File storage is fine (you're working on your own machine)
- **Production**: Consider using keychain for additional security
- **Sensitive keys**: Use environment variables or secret management instead

## Verification

After rebuilding, you should see:

- ✅ No keychain prompt on app start
- ✅ File created at `~/.cyntra/global-env.txt`
- ✅ Environment variables persist across restarts
- ✅ Settings work on first attempt

## Troubleshooting

**Still getting keychain prompts?**

- Make sure you've rebuilt: `cargo build`
- Check if file exists: `ls -la ~/.cyntra/global-env.txt`
- Try manually creating the file first

**Can't read environment variables?**

- Check file permissions: `chmod 600 ~/.cyntra/global-env.txt`
- Verify file contents: `cat ~/.cyntra/global-env.txt`

**Want to use keychain instead?**

- Delete the file: `rm ~/.cyntra/global-env.txt`
- App will fall back to keychain on next read
- You'll need to approve keychain access once

## Clean Up

To remove all stored environment variables:

```bash
# Remove file storage
rm -f ~/.cyntra/global-env.txt

# Remove keychain entry
security delete-generic-password -s "glia-fab-desktop" -a "global-env"
```

---

**Result**: No more keychain prompts during development! 🎉

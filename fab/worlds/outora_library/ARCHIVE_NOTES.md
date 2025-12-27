# Outora Library - Archive Notes

## Source Consolidation (Phase 5)

### Current Template

**Active Template**:

- `blender/template.blend` - Canonical source template (copied from outora_library_v0.4.0.blend)
- This is the single source of truth for world builds

### Files to Archive (Original Location)

The following files from `fab/assets/blender/` can be archived to external storage:

**Old Versions** (no longer needed for builds):

- `outora_library_v0.1.1.blend` (1.5GB)
- `outora_library_v0.2.0.blend` (1.2GB)
- `outora_library_v0.3.0.blend` (1.2GB)
- `outora_library_v0.4.0.blend` (1.2GB) - now copied to template.blend

**Reference/Source Files** (may have historical value):

- `Gothic_Kit_for_sketchfab.blend` (20MB)
- `gothic_library_2_cycles.blend` (182MB)
- `glyph.blend` (210KB)

**Total Size**: ~5.5GB can be archived

### Archiving Strategy

**Option 1: External Storage**

```bash
# Create archive directory
mkdir -p ~/Archives/outora-library-blend-files

# Move old versions
mv fab/assets/blender/outora_library_v0.*.blend ~/Archives/outora-library-blend-files/
mv fab/assets/blender/Gothic_Kit_for_sketchfab.blend ~/Archives/outora-library-blend-files/
mv fab/assets/blender/gothic_library_2_cycles.blend ~/Archives/outora-library-blend-files/

# Optional: Create tarball
cd ~/Archives
tar -czf outora-library-blend-archive-$(date +%Y%m%d).tar.gz outora-library-blend-files/
```

**Option 2: Git LFS Keep (Current)**

- Keep all files in Git LFS (current state)
- Git LFS only downloads on-demand, so doesn't bloat local checkouts
- Historical versions remain accessible via git

**Recommendation**: Keep in Git LFS for now. Archive to external storage only if repo size becomes an issue.

### Files to Keep

**Keep in repo (required for builds)**:

- `fab/worlds/outora_library/blender/template.blend` - Current canonical template
- All files in `fab/worlds/outora_library/blender/stages/*.py` - Build scripts
- `fab/worlds/outora_library/assets/` - Source textures, models, licenses

**Keep in original location (legacy support during transition)**:

- `fab/assets/blender/*.py` - Original scripts (referenced by stage scripts until Phase 7 migration)
- `kernel/src/cyntra/fab/outora/*.py` - Helper modules

### Post-Migration Cleanup

After full migration (Phase 7 complete):

1. Deprecate `fab/assets/` directory
2. Move helper modules to `fab/worlds/outora_library/lib/` if still needed
3. Archive all old blend files
4. Update documentation to point to world system

### Verification

After archiving:

```bash
# Verify world still builds
fab-world build \
  --world fab/worlds/outora_library \
  --output .cyntra/runs/verify_after_archive \
  --until prepare

# Check template exists
ls -lh fab/worlds/outora_library/blender/template.blend
```

## Repo Size Impact

**Before cleanup**: ~6GB (blend files)
**After cleanup**: ~1.2GB (only template.blend)
**Savings**: ~4.8GB (~80% reduction in blend file storage)

Note: Git LFS means users only download what they checkout, so impact is mainly on LFS storage quota.

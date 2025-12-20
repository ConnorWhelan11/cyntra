# Premed Shapes Attribution

This file documents the source, license, and attribution for all shape assets
included in the Premed Shapes library.

## Asset Sources

### Lucide Icons

**Source:** [Lucide Icons](https://lucide.dev)  
**Repository:** https://github.com/lucide-icons/lucide  
**License:** ISC License  
**License URL:** https://github.com/lucide-icons/lucide/blob/main/LICENSE

All icons in the current MVP are derived from Lucide Icons.

#### Included Icons

| Shape ID | Lucide Icon Name | Category |
|----------|------------------|----------|
| heart | heart | clinical |
| heart-pulse | heart-pulse | clinical |
| stethoscope | stethoscope | clinical |
| syringe | syringe | clinical |
| pill | pill | clinical |
| thermometer | thermometer | clinical |
| activity | activity | clinical |
| clipboard | clipboard-list | clinical |
| flask | flask-conical | lab |
| test-tube | test-tube | lab |
| microscope | microscope | lab |
| pipette | pipette | lab |
| droplet | droplet | lab |
| brain | brain | anatomy |
| bone | bone | anatomy |
| eye | eye | anatomy |
| ear | ear | anatomy |
| lungs | lungs | anatomy |
| dna | dna | bio-chem |
| atom | atom | bio-chem |
| hexagon | hexagon | bio-chem |
| cell | circle-dot | bio-chem |
| energy | zap | bio-chem |

---

## ISC License (Lucide Icons)

```
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part
of Feather (MIT). All other copyright (c) for Lucide are held by Lucide
Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

## Adding New Assets

When adding new shape assets to this library:

1. **Verify License**: Only use assets with permissive licenses (MIT, ISC, Apache-2.0)
2. **Document Source**: Add an entry to this file with:
   - Source name and URL
   - Repository URL (if applicable)
   - License type and URL
   - List of specific assets used
3. **Include License Text**: Add the full license text below
4. **Update generated.ts**: Add provenance metadata to each shape entry

### Acceptable Licenses

- MIT
- ISC
- Apache-2.0
- BSD-2-Clause
- BSD-3-Clause
- CC0
- Unlicense

### NOT Acceptable for MVP

- CC-BY (requires visible attribution in UI)
- CC-BY-SA (copyleft)
- GPL/LGPL (copyleft)
- Proprietary

---

## Modification Notes

Some icons have been modified from their original form:

- **Colors**: Stroke colors customized for visual distinction by category
- **Size**: Normalized to 24x24 viewBox for consistency
- **Optimization**: Cleaned up for smaller data URI size

All modifications are permitted under the ISC license.


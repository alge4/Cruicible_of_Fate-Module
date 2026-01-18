# Release Guide

This guide explains how to create releases for the Crucible of Fate Foundry VTT module.

## Quick Start

### Create a release with current version
```powershell
.\release.ps1
```

### Bump version and create release
```powershell
# Patch version (0.1.0 -> 0.1.1)
.\release.ps1 -Patch

# Minor version (0.1.0 -> 0.2.0)
.\release.ps1 -Minor

# Major version (0.1.0 -> 1.0.0)
.\release.ps1 -Major

# Specific version
.\release.ps1 -Version 0.1.2
```

### Using npm scripts
```bash
npm run release          # Current version
npm run release:patch    # Bump patch
npm run release:minor    # Bump minor
npm run release:major    # Bump major
```

## Release Workflow for v0.1.x

Since you're working on v0.1, use patch versions for iterations:

```powershell
# First iteration
.\release.ps1 -Patch  # Creates v0.1.1

# Second iteration
.\release.ps1 -Patch  # Creates v0.1.2

# Continue until ready for v0.2.0
.\release.ps1 -Minor  # Creates v0.2.0
```

## What the Script Does

1. **Updates version** in `module.json`
2. **Creates a zip file** in the `release/` directory
3. **Excludes dev files** (.git, node_modules, etc.)
4. **Includes only necessary files** (scripts, templates, styles, lang, module.json)

## GitHub Release Steps

After running the release script:

1. **Test the zip** in your local Foundry instance
2. **Create a GitHub release**:
   ```bash
   # Using GitHub CLI
   gh release create v0.1.1 release/crucible-of-fate-v0.1.1.zip --title "v0.1.1" --notes "Release notes"
   
   # OR manually upload via GitHub web interface
   ```
3. **Update module.json URLs** (if hosting on GitHub):
   ```json
   {
     "manifest": "https://raw.githubusercontent.com/yourusername/repo/main/module.json",
     "download": "https://github.com/yourusername/repo/releases/download/v0.1.1/crucible-of-fate-v0.1.1.zip"
   }
   ```

## Version Numbering

- **v0.1.x** - Development iterations (bug fixes, small features)
- **v0.2.0** - Next minor version (new features)
- **v1.0.0** - First stable release

## Files Included in Release

- `module.json`
- `scripts/` (all JavaScript files)
- `templates/` (all Handlebars templates)
- `styles/` (all CSS files)
- `lang/` (all language files)

## Files Excluded

- `.git/`
- `node_modules/`
- `release/`
- `*.ps1`, `*.md` (documentation)
- Development files

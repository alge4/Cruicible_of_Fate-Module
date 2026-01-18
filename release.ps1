# Foundry VTT Module Release Script
# Creates a release zip file and optionally updates version

param(
    [string]$Version = "",
    [switch]$Patch,
    [switch]$Minor,
    [switch]$Major,
    [switch]$NoZip,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# Show help
if ($Help) {
    Write-Host "Foundry VTT Module Release Script" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\release.ps1                    # Create zip with current version"
    Write-Host "  .\release.ps1 -Patch             # Bump patch version (0.1.0 -> 0.1.1)"
    Write-Host "  .\release.ps1 -Minor             # Bump minor version (0.1.0 -> 0.2.0)"
    Write-Host "  .\release.ps1 -Major             # Bump major version (0.1.0 -> 1.0.0)"
    Write-Host "  .\release.ps1 -Version 0.1.2     # Set specific version"
    Write-Host "  .\release.ps1 -NoZip             # Only update version, don't create zip"
    Write-Host ""
    exit 0
}

# Get module.json path
$ModuleJsonPath = Join-Path $PSScriptRoot "module.json"
if (-not (Test-Path $ModuleJsonPath)) {
    Write-Error "module.json not found at $ModuleJsonPath"
    exit 1
}

# Read current module.json
$ModuleJson = Get-Content $ModuleJsonPath | ConvertFrom-Json
$CurrentVersion = $ModuleJson.version

Write-Host "Current version: $CurrentVersion" -ForegroundColor Cyan

# Determine new version
$NewVersion = $CurrentVersion
if ($Version) {
    $NewVersion = $Version
} elseif ($Patch) {
    $parts = $CurrentVersion.Split('.')
    $parts[2] = [int]$parts[2] + 1
    $NewVersion = $parts -join '.'
} elseif ($Minor) {
    $parts = $CurrentVersion.Split('.')
    $parts[1] = [int]$parts[1] + 1
    $parts[2] = 0
    $NewVersion = $parts -join '.'
} elseif ($Major) {
    $parts = $CurrentVersion.Split('.')
    $parts[0] = [int]$parts[0] + 1
    $parts[1] = 0
    $parts[2] = 0
    $NewVersion = $parts -join '.'
}

# Update version in module.json
if ($NewVersion -ne $CurrentVersion) {
    Write-Host "Updating version to: $NewVersion" -ForegroundColor Green
    $ModuleJson.version = $NewVersion
    $ModuleJson | ConvertTo-Json -Depth 10 | Set-Content $ModuleJsonPath -Encoding UTF8
    Write-Host "✓ module.json updated" -ForegroundColor Green
} else {
    Write-Host "Using current version: $NewVersion" -ForegroundColor Yellow
}

# Create release zip
if (-not $NoZip) {
    $ReleaseDir = Join-Path $PSScriptRoot "release"
    $ZipName = "crucible-of-fate-v$NewVersion.zip"
    $ZipPath = Join-Path $ReleaseDir $ZipName
    
    # Create release directory
    if (-not (Test-Path $ReleaseDir)) {
        New-Item -ItemType Directory -Path $ReleaseDir | Out-Null
    }
    
    # Files/directories to include
    $IncludePaths = @(
        "lang",
        "scripts",
        "styles",
        "templates",
        "module.json"
    )
    
    # Files/directories to exclude
    $ExcludePaths = @(
        ".git",
        ".gitignore",
        "node_modules",
        "release",
        "*.ps1",
        "*.md",
        "package*.json",
        ".vscode",
        ".idea"
    )
    
    Write-Host "Creating release zip..." -ForegroundColor Cyan
    
    # Create temp directory
    $TempDir = Join-Path $env:TEMP "crucible-release-$(Get-Random)"
    New-Item -ItemType Directory -Path $TempDir | Out-Null
    
    try {
        # Copy files to temp directory
        foreach ($include in $IncludePaths) {
            $SourcePath = Join-Path $PSScriptRoot $include
            if (Test-Path $SourcePath) {
                $DestPath = Join-Path $TempDir $include
                if (Test-Path $SourcePath -PathType Container) {
                    Copy-Item -Path $SourcePath -Destination $DestPath -Recurse -Force
                } else {
                    Copy-Item -Path $SourcePath -Destination $DestPath -Force
                }
            }
        }
        
        # Create zip file
        if (Test-Path $ZipPath) {
            Remove-Item $ZipPath -Force
        }
        
        Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipPath -Force
        
        $ZipSize = (Get-Item $ZipPath).Length / 1KB
        Write-Host "✓ Release zip created: $ZipPath ($([math]::Round($ZipSize, 2)) KB)" -ForegroundColor Green
        
        # Show next steps
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Yellow
        Write-Host "1. Test the zip file by installing it in Foundry"
        Write-Host "2. Create a GitHub release:"
        Write-Host "   gh release create v$NewVersion $ZipPath --title 'v$NewVersion' --notes 'Release notes here'"
        Write-Host "   OR upload $ZipPath manually to GitHub Releases"
        Write-Host "3. Update module.json URLs if needed:"
        Write-Host "   manifest: https://raw.githubusercontent.com/yourusername/repo/main/module.json"
        Write-Host "   download: https://github.com/yourusername/repo/releases/download/v$NewVersion/$ZipName"
        
    } finally {
        # Cleanup temp directory
        if (Test-Path $TempDir) {
            Remove-Item $TempDir -Recurse -Force
        }
    }
}

Write-Host ""
Write-Host "Release preparation complete!" -ForegroundColor Green

# Foundry VTT Module Release Script
# Creates a release zip file and optionally updates version

param(
    [string]$Version = "",
    [switch]$Patch,
    [switch]$Minor,
    [switch]$Major,
    [switch]$NoZip,
    [switch]$NoGitHub,
    [string]$ReleaseNotes = "",
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
    Write-Host "  .\release.ps1 -NoGitHub          # Skip GitHub release creation"
    Write-Host "  .\release.ps1 -ReleaseNotes '...' # Set release notes for GitHub"
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
}
elseif ($Patch) {
    $parts = $CurrentVersion.Split('.')
    $parts[2] = [int]$parts[2] + 1
    $NewVersion = $parts -join '.'
}
elseif ($Minor) {
    $parts = $CurrentVersion.Split('.')
    $parts[1] = [int]$parts[1] + 1
    $parts[2] = 0
    $NewVersion = $parts -join '.'
}
elseif ($Major) {
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
    # Save without BOM (UTF8NoBOM) to avoid JSON parsing errors
    $jsonContent = $ModuleJson | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($ModuleJsonPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))
    Write-Host "module.json updated" -ForegroundColor Green
}
else {
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
                    Write-Host "  Copied directory: $include" -ForegroundColor Gray
                }
                else {
                    # For module.json, ensure it's saved without BOM
                    if ($include -eq "module.json") {
                        $content = Get-Content $SourcePath -Raw
                        [System.IO.File]::WriteAllText($DestPath, $content, [System.Text.UTF8Encoding]::new($false))
                        Write-Host "  Copied file: $include (without BOM)" -ForegroundColor Gray
                    }
                    else {
                        Copy-Item -Path $SourcePath -Destination $DestPath -Force
                        Write-Host "  Copied file: $include" -ForegroundColor Gray
                    }
                }
            }
            else {
                Write-Host "  Warning: $include not found, skipping" -ForegroundColor Yellow
            }
        }
        
        # Verify module.json was copied
        $ModuleJsonInTemp = Join-Path $TempDir "module.json"
        if (-not (Test-Path $ModuleJsonInTemp)) {
            Write-Error "module.json was not copied to temp directory! Aborting."
            exit 1
        }
        Write-Host "  Verified: module.json included" -ForegroundColor Green
        
        # Create zip file
        if (Test-Path $ZipPath) {
            Remove-Item $ZipPath -Force
        }
        
        # Create zip with all files and folders at root level
        Compress-Archive -Path "$TempDir\*" -DestinationPath $ZipPath -Force
        
        # Verify module.json is in the zip
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
        $moduleJsonFound = $false
        foreach ($entry in $zip.Entries) {
            if ($entry.Name -eq "module.json") {
                $moduleJsonFound = $true
                break
            }
        }
        $zip.Dispose()
        
        if (-not $moduleJsonFound) {
            Write-Error "module.json not found in zip file! The release is invalid."
            Remove-Item $ZipPath -Force
            exit 1
        }
        
        $ZipSize = (Get-Item $ZipPath).Length / 1KB
        Write-Host "Release zip created: $ZipPath ($([math]::Round($ZipSize, 2)) KB)" -ForegroundColor Green
        Write-Host "  Verified: module.json is in the zip" -ForegroundColor Green
        
        # Create GitHub release if requested
        if (-not $NoGitHub) {
            Write-Host ""
            Write-Host "Creating GitHub release..." -ForegroundColor Cyan
            
            # Check if GitHub CLI is installed
            $ghInstalled = $false
            try {
                $null = gh --version 2>&1
                $ghInstalled = $true
            }
            catch {
                $ghInstalled = $false
            }
            
            if (-not $ghInstalled) {
                Write-Host "GitHub CLI (gh) not found. Install from: https://cli.github.com/" -ForegroundColor Yellow
                Write-Host "Skipping GitHub release creation." -ForegroundColor Yellow
            }
            else {
                # Get repository info from git
                $repoInfo = $null
                try {
                    $remoteUrl = git remote get-url origin 2>&1
                    if ($remoteUrl -match 'github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$') {
                        $repoOwner = $matches[1]
                        $repoName = $matches[2] -replace '\.git$', ''
                        $repoInfo = @{
                            Owner = $repoOwner
                            Name = $repoName
                        }
                    }
                }
                catch {
                    # Git not available or not a git repo
                }
                
                if (-not $repoInfo) {
                    Write-Host "Could not detect GitHub repository. Please create release manually:" -ForegroundColor Yellow
                    Write-Host "  gh release create v$NewVersion '$ZipPath' '$ModuleJsonPath' --title 'v$NewVersion' --notes 'Release notes'" -ForegroundColor Yellow
                }
                else {
                    # Check if already authenticated
                    $authStatus = gh auth status 2>&1
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "GitHub CLI not authenticated. Run: gh auth login" -ForegroundColor Yellow
                        Write-Host "Skipping GitHub release creation." -ForegroundColor Yellow
                    }
                    else {
                        # Prepare release notes
                        if (-not $ReleaseNotes) {
                            $ReleaseNotes = "Release v$NewVersion`n`nSee module.json for details."
                        }
                        
                        # Create the release
                        $tagName = "v$NewVersion"
                        $releaseTitle = "v$NewVersion"
                        
                        Write-Host "Creating release: $tagName" -ForegroundColor Cyan
                        
                        try {
                            # Create release with both zip and module.json as assets
                            Write-Host "  Uploading assets: $ZipName and module.json" -ForegroundColor Gray
                            $releaseCmd = "gh release create $tagName '$ZipPath' '$ModuleJsonPath' --title '$releaseTitle' --notes '$ReleaseNotes'"
                            Invoke-Expression $releaseCmd
                            
                            if ($LASTEXITCODE -eq 0) {
                                Write-Host "GitHub release created successfully!" -ForegroundColor Green
                                Write-Host "Release URL: https://github.com/$($repoInfo.Owner)/$($repoInfo.Name)/releases/tag/$tagName" -ForegroundColor Cyan
                                
                                # Update module.json URLs if they're empty
                                if (-not $ModuleJson.manifest -or $ModuleJson.manifest -eq "") {
                                    $ModuleJson.manifest = "https://raw.githubusercontent.com/$($repoInfo.Owner)/$($repoInfo.Name)/main/module.json"
                                    Write-Host "Updated manifest URL in module.json" -ForegroundColor Green
                                }
                                
                                if (-not $ModuleJson.download -or $ModuleJson.download -eq "") {
                                    $ModuleJson.download = "https://github.com/$($repoInfo.Owner)/$($repoInfo.Name)/releases/download/$tagName/$ZipName"
                                    Write-Host "Updated download URL in module.json" -ForegroundColor Green
                                }
                                
                                if (-not $ModuleJson.url -or $ModuleJson.url -eq "") {
                                    $ModuleJson.url = "https://github.com/$($repoInfo.Owner)/$($repoInfo.Name)"
                                    Write-Host "Updated repository URL in module.json" -ForegroundColor Green
                                }
                                
                                # Save updated module.json without BOM
                                $jsonContent = $ModuleJson | ConvertTo-Json -Depth 10
                                [System.IO.File]::WriteAllText($ModuleJsonPath, $jsonContent, [System.Text.UTF8Encoding]::new($false))
                            }
                            else {
                                Write-Host "Failed to create GitHub release. Check your authentication and permissions." -ForegroundColor Red
                            }
                        }
                        catch {
                            Write-Host "Error creating GitHub release: $_" -ForegroundColor Red
                            Write-Host "You can create it manually with:" -ForegroundColor Yellow
                            Write-Host "  gh release create v$NewVersion '$ZipPath' '$ModuleJsonPath' --title 'v$NewVersion' --notes 'Release notes'" -ForegroundColor Yellow
                        }
                    }
                }
            }
        }
        
        # Show next steps if GitHub release was skipped
        if ($NoGitHub) {
            Write-Host ""
            Write-Host "Next steps:" -ForegroundColor Yellow
            Write-Host "1. Test the zip file by installing it in Foundry"
            Write-Host "2. Create a GitHub release:"
            Write-Host "   gh release create v$NewVersion '$ZipPath' '$ModuleJsonPath' --title 'v$NewVersion' --notes 'Release notes here'"
            Write-Host "   OR upload both $ZipName and module.json manually to GitHub Releases"
            Write-Host "3. Update module.json URLs if needed:"
            Write-Host "   manifest: https://raw.githubusercontent.com/yourusername/repo/main/module.json"
            Write-Host "   download: https://github.com/yourusername/repo/releases/download/v$NewVersion/$ZipName"
        }
    }
    finally {
        # Cleanup temp directory
        if (Test-Path $TempDir) {
            Remove-Item $TempDir -Recurse -Force
        }
    }
}

Write-Host ""
Write-Host "Release preparation complete!" -ForegroundColor Green

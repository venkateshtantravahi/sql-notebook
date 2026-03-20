#!/usr/bin/env bash
# register-sqlnb-macos.sh
#
# Creates a minimal macOS .app stub that registers the .sqlnb file extension
# with Launch Services.  Run this once from the project root; from then on
# double-clicking any .sqlnb file in Finder will:
#   1. Copy the file to ~/.sqlnotebook/drafts/current.sqlnb
#   2. Open http://localhost:8080 in your default browser
#      (start sql-notebook separately if it is not already running)
#
# Usage:
#   chmod +x scripts/register-sqlnb-macos.sh
#   ./scripts/register-sqlnb-macos.sh
#
# To unregister:
#   rm -rf ~/Applications/sql-notebook.app
#   /System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -u ~/Applications/sql-notebook.app

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$HOME/Applications/sql-notebook.app"
MACOS_DIR="$APP_DIR/Contents/MacOS"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister"

echo "Creating sql-notebook.app stub at $APP_DIR ..."
mkdir -p "$MACOS_DIR"

# ----- Info.plist -----
cat > "$APP_DIR/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>             <string>sql-notebook</string>
  <key>CFBundleIdentifier</key>       <string>io.sqlnotebook.app</string>
  <key>CFBundleVersion</key>          <string>0.5.0</string>
  <key>CFBundlePackageType</key>      <string>APPL</string>
  <key>CFBundleExecutable</key>       <string>open-sqlnb</string>

  <!-- Exported UTI so Finder knows .sqlnb is our type -->
  <key>UTExportedTypeDeclarations</key>
  <array>
    <dict>
      <key>UTTypeIdentifier</key>     <string>io.sqlnotebook.sqlnb</string>
      <key>UTTypeDescription</key>    <string>SQL Notebook</string>
      <key>UTTypeConformsTo</key>
      <array>
        <string>public.json</string>
      </array>
      <key>UTTypeTagSpecification</key>
      <dict>
        <key>public.filename-extension</key> <string>sqlnb</string>
        <key>public.mime-type</key>          <string>application/x-sqlnotebook</string>
      </dict>
    </dict>
  </array>

  <!-- Document type association -->
  <key>CFBundleDocumentTypes</key>
  <array>
    <dict>
      <key>CFBundleTypeExtensions</key>
      <array><string>sqlnb</string></array>
      <key>CFBundleTypeMIMETypes</key>
      <array><string>application/x-sqlnotebook</string></array>
      <key>CFBundleTypeRole</key>     <string>Editor</string>
      <key>LSItemContentTypes</key>
      <array><string>io.sqlnotebook.sqlnb</string></array>
      <key>CFBundleTypeIconFile</key> <string>sqlnb</string>
    </dict>
  </array>
</dict>
</plist>
PLIST

# ----- Launcher executable -----
cat > "$MACOS_DIR/open-sqlnb" << 'SCRIPT'
#!/usr/bin/env bash
# Called by macOS with the .sqlnb file path as $1
FILE="$1"

# Resolve symlinks so Path.of() in Java gets the real path
if [ -L "$FILE" ]; then
  FILE="$(readlink -f "$FILE")"
fi

DRAFT_DIR="$HOME/.sqlnotebook/drafts"
mkdir -p "$DRAFT_DIR"

# Atomic copy: write tmp then rename so DraftHandler never sees a partial file
cp "$FILE" "$DRAFT_DIR/current.sqlnb.tmp"
mv -f "$DRAFT_DIR/current.sqlnb.tmp" "$DRAFT_DIR/current.sqlnb"

# Open the browser (bring existing tab to front if already open)
open "http://localhost:8080"
SCRIPT
chmod +x "$MACOS_DIR/open-sqlnb"

# ----- Register with Launch Services -----
if [ -f "$LSREGISTER" ]; then
    "$LSREGISTER" -f "$APP_DIR"
    echo "[OK] Launch Services updated"
else
    echo "[WARN] lsregister not found -- run: /System/Library/.../lsregister -f $APP_DIR"
fi

echo ""
echo "[OK] .sqlnb files are now associated with sql-notebook"
echo "  App stub: $APP_DIR"
echo ""
echo "  To open a notebook:  double-click any .sqlnb file in Finder"
echo "  Make sure the server is running first:  ./gradlew run"
echo ""
echo "  Note: Finder may need a logout/login before showing the new icon."

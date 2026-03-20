#!/usr/bin/env bash
# register-sqlnb-linux.sh
#
# Registers the .sqlnb file extension with the Linux desktop environment via
# xdg-mime and a .desktop file.  Works on GNOME, KDE, XFCE, and any other
# FreeDesktop-compatible environment.
#
# After running this script, double-clicking a .sqlnb file in your file manager
# will:
#   1. Copy the file to ~/.sqlnotebook/drafts/current.sqlnb
#   2. Open http://localhost:8080 in your default browser
#      (start sql-notebook separately if it is not already running)
#
# Usage (run from the project root):
#   chmod +x scripts/register-sqlnb-linux.sh
#   ./scripts/register-sqlnb-linux.sh
#
# To unregister:
#   rm -f ~/.local/share/mime/packages/sqlnb.xml
#   rm -f ~/.local/share/applications/sql-notebook-open.desktop
#   update-mime-database ~/.local/share/mime
#   update-desktop-database ~/.local/share/applications

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIME_DIR="$HOME/.local/share/mime/packages"
APP_DIR="$HOME/.local/share/applications"
BIN_DIR="$HOME/.local/bin"
LAUNCHER="$BIN_DIR/sqlnb-open"

mkdir -p "$MIME_DIR" "$APP_DIR" "$BIN_DIR"

# ----- MIME type XML -----
cat > "$MIME_DIR/sqlnb.xml" << 'XML'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-sqlnotebook">
    <comment>SQL Notebook</comment>
    <glob pattern="*.sqlnb"/>
    <magic priority="50">
      <match type="string" offset="0" value="{"/>
    </magic>
  </mime-type>
</mime-info>
XML

# ----- Launcher script (called by the .desktop file) -----
cat > "$LAUNCHER" << SCRIPT
#!/usr/bin/env bash
FILE="\$1"
[ -z "\$FILE" ] && exit 1

# Resolve symlinks
FILE="\$(readlink -f "\$FILE")"

DRAFT_DIR="\$HOME/.sqlnotebook/drafts"
mkdir -p "\$DRAFT_DIR"

# Atomic copy
cp "\$FILE" "\$DRAFT_DIR/current.sqlnb.tmp"
mv -f "\$DRAFT_DIR/current.sqlnb.tmp" "\$DRAFT_DIR/current.sqlnb"

# Open default browser
if command -v xdg-open &>/dev/null; then
    xdg-open "http://localhost:8080"
elif command -v gnome-open &>/dev/null; then
    gnome-open "http://localhost:8080"
else
    echo "Open http://localhost:8080 in your browser"
fi
SCRIPT
chmod +x "$LAUNCHER"

# ----- .desktop file -----
cat > "$APP_DIR/sql-notebook-open.desktop" << DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=sql-notebook
Comment=Open SQL Notebook file
Exec=${LAUNCHER} %f
Terminal=false
MimeType=application/x-sqlnotebook;
NoDisplay=true
DESKTOP

# ----- Register everything -----
if command -v update-mime-database &>/dev/null; then
    update-mime-database "$HOME/.local/share/mime"
    echo "[OK] MIME database updated"
else
    echo "[WARN] update-mime-database not found -- install shared-mime-info package"
fi

if command -v update-desktop-database &>/dev/null; then
    update-desktop-database "$APP_DIR"
    echo "[OK] Desktop database updated"
fi

if command -v xdg-mime &>/dev/null; then
    xdg-mime default sql-notebook-open.desktop application/x-sqlnotebook
    echo "[OK] xdg-mime default set"
fi

echo ""
echo "[OK] .sqlnb files are now associated with sql-notebook"
echo "  Launcher: $LAUNCHER"
echo ""
echo "  To open a notebook:  double-click any .sqlnb file in your file manager"
echo "  Make sure the server is running first:  sql-notebook (or ./gradlew run)"
echo ""
echo "  Note: You may need to log out and back in for all file managers to pick up"
echo "  the new association."

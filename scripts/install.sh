#!/usr/bin/env bash
# install.sh -- Install sql-notebook as a CLI command available anywhere in your terminal.
#
# After running this script you can do:
#   sql-notebook                      # open workspace in CWD (like: jupyter notebook)
#   sql-notebook ~/projects/myapp     # open workspace in a specific directory
#   sql-notebook path/to/file.sqlnb   # open a specific notebook file
#
# The script:
#   1. Builds the Gradle distribution (./gradlew installDist)
#   2. Installs it to ~/.local/share/sql-notebook/
#   3. Creates a wrapper script at ~/.local/bin/sql-notebook
#   4. Adds ~/.local/bin to your PATH if not already there
#
# Usage (run from the project root):
#   chmod +x scripts/install.sh
#   ./scripts/install.sh
#
# To uninstall:
#   rm -rf ~/.local/share/sql-notebook
#   rm -f  ~/.local/bin/sql-notebook

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="$HOME/.local/share/sql-notebook"
BIN_DIR="$HOME/.local/bin"
CMD="$BIN_DIR/sql-notebook"

echo "Building sql-notebook distribution..."
cd "$PROJECT_DIR"
./gradlew installDist -q
echo "[OK] Build complete"

# Locate the generated distribution
DIST="$PROJECT_DIR/sql-notebook-core/build/install/sql-notebook-core"
if [ ! -d "$DIST" ]; then
    echo "[FAIL] Distribution not found at $DIST"
    exit 1
fi

# Copy distribution to install dir
echo "Installing to $INSTALL_DIR ..."
rm -rf "$INSTALL_DIR"
cp -r "$DIST" "$INSTALL_DIR"
mkdir -p "$BIN_DIR"

# Write a thin wrapper script so users can just type 'sql-notebook'
cat > "$CMD" << WRAPPER
#!/usr/bin/env bash
# sql-notebook launcher
# Passes all arguments to the app; the JVM uses \$PWD as the workspace by default.
exec "$INSTALL_DIR/bin/sql-notebook-core" "\$@"
WRAPPER
chmod +x "$CMD"

# Offer to add ~/.local/bin to PATH if it isn't already
SHELL_RC=""
case "$SHELL" in
    */zsh)  SHELL_RC="$HOME/.zshrc"  ;;
    */bash) SHELL_RC="$HOME/.bashrc" ;;
esac

if ! echo "$PATH" | grep -q "$BIN_DIR"; then
    if [ -n "$SHELL_RC" ]; then
        echo "" >> "$SHELL_RC"
        echo "# sql-notebook" >> "$SHELL_RC"
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
        echo "[OK] Added ~/.local/bin to PATH in $SHELL_RC"
        echo "  Run: source $SHELL_RC   (or open a new terminal)"
    else
        echo "[WARN] Add ~/.local/bin to your PATH to use the sql-notebook command"
    fi
else
    echo "[OK] ~/.local/bin already in PATH"
fi

echo ""
echo "[OK] sql-notebook installed successfully"
echo ""
echo "  Usage:"
echo "    sql-notebook                    # open workspace in current directory"
echo "    sql-notebook ~/projects/myapp   # open a specific workspace"
echo "    sql-notebook my-notebook.sqlnb  # open a specific notebook"
echo ""
echo "  The app opens at http://localhost:8080"

#!/usr/bin/env bash
# install.sh — US Beach Flag Monitor
# Copies the extension into your GNOME extensions directory,
# compiles GSettings schemas, and enables the extension.

set -euo pipefail

UUID="us-beach-flag-monitor@wishbone305"
DEST="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

echo "Installing US Beach Flag Monitor..."

# 1. Copy extension files
mkdir -p "${DEST}"
cp -r extension.js prefs.js metadata.json stylesheet.css icons schemas "${DEST}/"

# 2. Compile GSettings schema
echo "Compiling schemas..."
glib-compile-schemas "${DEST}/schemas/"

# 3. Enable the extension
echo "Enabling extension..."
if gnome-extensions enable "${UUID}" 2>/dev/null; then
    echo ""
    echo "✓ Extension enabled successfully."
    echo "  The flag icon will appear in your top bar within a few seconds."
else
    echo ""
    echo "✓ Files installed. The extension was not auto-enabled."
    echo "  Log out and back in, then run:"
    echo "    gnome-extensions enable ${UUID}"
fi

echo ""
echo "To configure the location, open GNOME Extensions Manager and"
echo "click the gear icon next to 'US Beach Flag Monitor'."

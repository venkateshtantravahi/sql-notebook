#!/usr/bin/env bash
# Downloads the Chinook sample SQLite database into this directory.
# Chinook models a music store: Artists, Albums, Tracks, Invoices, Customers.
# Source: https://github.com/lerocha/chinook-database

set -e

DEST="$(dirname "$0")/chinook.db"

if [ -f "$DEST" ]; then
  echo "chinook.db already exists at $DEST — skipping download."
  exit 0
fi

echo "Downloading Chinook SQLite database..."
curl -fsSL \
  "https://github.com/lerocha/chinook-database/raw/master/ChinookDatabase/DataSources/Chinook_Sqlite.sqlite" \
  -o "$DEST"

echo "Done: $DEST"
echo ""
echo "Register it in sql-notebook:"
echo "  File > Add Data Source... > Local File"
echo "  Upload: $DEST"
echo "  Namespace will be pre-filled as: chinook"

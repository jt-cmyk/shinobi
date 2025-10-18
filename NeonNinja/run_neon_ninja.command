#!/bin/bash

# Dette script finder selv den mappe, det ligger i.
# Uanset om mappen er på Skrivebordet eller iCloud.

# Få stien til den mappe, hvor dette script (*.command) ligger.
SCRIPT_DIR=$(dirname "$0")

# Skift mappe til den mappe
cd "$SCRIPT_DIR" || exit 1

# Kør start-scriptet, som nu er i den nuværende mappe
./start_neon_ninja.sh

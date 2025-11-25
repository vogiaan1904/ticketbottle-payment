#!/bin/bash
set -e

# Get script's directory and navigate to lambda root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="$SCRIPT_DIR/.."
SOURCE_SCHEMA="$LAMBDA_DIR/../prisma/schema.prisma"

# Validate and copy schema
[ ! -f "$SOURCE_SCHEMA" ] && echo "Error: Schema not found at $SOURCE_SCHEMA" && exit 1

echo "Setting up Prisma for Lambda..."
mkdir -p "$LAMBDA_DIR/prisma"
cp "$SOURCE_SCHEMA" "$LAMBDA_DIR/prisma/"

# Generate Prisma client
cd "$LAMBDA_DIR"
npx prisma generate

echo "Setup complete!"

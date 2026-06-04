#!/usr/bin/env bash
set -euo pipefail

# Creates a 2 GB swap file and makes it permanent across reboots.
# Safe to run multiple times — skips if /swapfile already exists.

if [ -f /swapfile ]; then
    echo "Swap file already exists, skipping."
    swapon --show
    exit 0
fi

echo "=== Creating 2 GB swap file ==="
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

echo "=== Making swap permanent ==="
if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "=== Swap active ==="
swapon --show
free -h

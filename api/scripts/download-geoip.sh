#!/bin/bash
# Download MaxMind GeoLite2 databases
#
# Prerequisites:
#   - MaxMind account (free registration at https://www.maxmind.com/en/geolite2/signup)
#   - License key generated from account dashboard
#
# Usage:
#   export MAXMIND_ACCOUNT_ID="your_account_id"
#   export MAXMIND_LICENSE_KEY="your_license_key"
#   ./download-geoip.sh

set -e

# Configuration
ACCOUNT_ID="${MAXMIND_ACCOUNT_ID:?Error: Set MAXMIND_ACCOUNT_ID environment variable}"
LICENSE_KEY="${MAXMIND_LICENSE_KEY:?Error: Set MAXMIND_LICENSE_KEY environment variable}"
DATA_DIR="${GEOIP_DATA_PATH:-/data/geoip}"

echo "========================================="
echo "MaxMind GeoLite2 Database Downloader"
echo "========================================="
echo ""

# Create data directory
mkdir -p "$DATA_DIR"
echo "Data directory: $DATA_DIR"

# Download GeoLite2-City
echo ""
echo "Downloading GeoLite2-City database..."
curl -sSL "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz" \
  -u "${ACCOUNT_ID}:${LICENSE_KEY}" \
  -o /tmp/GeoLite2-City.tar.gz

if [ $? -eq 0 ]; then
  echo "Extracting GeoLite2-City..."
  tar -xzf /tmp/GeoLite2-City.tar.gz -C /tmp
  mv /tmp/GeoLite2-City_*/GeoLite2-City.mmdb "$DATA_DIR/"
  rm -rf /tmp/GeoLite2-City.tar.gz /tmp/GeoLite2-City_*
  echo "GeoLite2-City database installed successfully"
else
  echo "Error: Failed to download GeoLite2-City database"
  echo "Please check your account ID and license key"
  exit 1
fi

# Download GeoLite2-ASN
echo ""
echo "Downloading GeoLite2-ASN database..."
curl -sSL "https://download.maxmind.com/geoip/databases/GeoLite2-ASN/download?suffix=tar.gz" \
  -u "${ACCOUNT_ID}:${LICENSE_KEY}" \
  -o /tmp/GeoLite2-ASN.tar.gz

if [ $? -eq 0 ]; then
  echo "Extracting GeoLite2-ASN..."
  tar -xzf /tmp/GeoLite2-ASN.tar.gz -C /tmp
  mv /tmp/GeoLite2-ASN_*/GeoLite2-ASN.mmdb "$DATA_DIR/"
  rm -rf /tmp/GeoLite2-ASN.tar.gz /tmp/GeoLite2-ASN_*
  echo "GeoLite2-ASN database installed successfully"
else
  echo "Error: Failed to download GeoLite2-ASN database"
  exit 1
fi

# Show results
echo ""
echo "========================================="
echo "GeoIP databases installed successfully!"
echo "========================================="
echo ""
ls -lh "$DATA_DIR"
echo ""
echo "Note: MaxMind updates these databases weekly on Tuesdays."
echo "Consider setting up a cron job to run this script weekly:"
echo "  0 3 * * 3 /path/to/download-geoip.sh"
echo ""

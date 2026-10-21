#!/bin/bash
# make-certs.sh — rebuild include/certs.h from the macOS system root store.
# Public CA certificates only (no secrets). Rerun if LogNog's HTTPS chain changes:
#   echo | openssl s_client -connect logs.machinekinglabs.com:443 -servername logs.machinekinglabs.com 2>/dev/null | grep -E 's:|i:'
set -e
cd "$(dirname "$0")"
KC=/System/Library/Keychains/SystemRootCertificates.keychain
{
  echo '// Root certificates the screen trusts for HTTPS (public CA certificates, not secrets).'
  echo '// logs.machinekinglabs.com is served through Cloudflare with a Google Trust Services'
  echo '// chain (WE1 -> GTS Root R4, cross-signed by GlobalSign Root CA, checked 2026-10-21).'
  echo "// GTS Root R1 and ISRG Root X1 (Let's Encrypt) are here too in case the chain changes."
  echo '// Made from the macOS system root store by make-certs.sh; rerun it to refresh.'
  echo '#pragma once'
  echo 'static const char LOGNOG_ROOT_CAS[] ='
  for c in "GTS Root R4" "GTS Root R1" "GlobalSign Root CA" "ISRG Root X1"; do
    echo "  // $c"
    security find-certificate -c "$c" -p "$KC" | sed 's/^/  "/; s/$/\\n"/'
  done
  echo '  ;'
} > include/certs.h
echo "wrote include/certs.h"

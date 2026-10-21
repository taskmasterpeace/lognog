#!/bin/bash
# make-certs.sh — rebuild include/certs.h from the macOS system root store.
# Public CA certificates only (no secrets). Rerun if LogNog's HTTPS chain changes:
#   echo | openssl s_client -connect lognog.machinekinglabs.com:443 -servername lognog.machinekinglabs.com 2>/dev/null | grep -E 's:|i:'
set -e
cd "$(dirname "$0")"
KC=/System/Library/Keychains/SystemRootCertificates.keychain
{
  echo '// Root certificates the screen trusts for HTTPS (public CA certificates, not secrets).'
  echo "// lognog.machinekinglabs.com (the LogNog API keys work on) has a Let's Encrypt chain:"
  echo '// YR2 -> Root YR -> ISRG Root X1 (checked 2026-10-21). logs.machinekinglabs.com sits behind'
  echo '// Cloudflare Access and answers a key with a login page, so screens must not use it.'
  echo '// The Google Trust Services and GlobalSign roots stay in case LogNog moves behind Cloudflare.'
  echo '// Made from the macOS system root store by make-certs.sh; rerun it to refresh.'
  echo '#pragma once'
  echo 'static const char LOGNOG_ROOT_CAS[] ='
  for c in "ISRG Root X1" "ISRG Root X2" "GTS Root R4" "GTS Root R1" "GlobalSign Root CA"; do
    echo "  // $c"
    security find-certificate -c "$c" -p "$KC" | sed 's/^/  "/; s/$/\\n"/'
  done
  echo '  ;'
} > include/certs.h
echo "wrote include/certs.h"

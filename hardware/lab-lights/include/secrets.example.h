// Copy this file to include/secrets.h and fill it in. secrets.h is git-ignored:
// never commit it. Use a LogNog API key with ONLY the "read" permission
// (Settings -> API keys -> New key -> tick "read"), limited to the index this
// app logs to (Data Sources shows it), so the key can't read any other app's logs.
#pragma once

#define WIFI_SSID "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Which app this screen shows: the app name or index as LogNog's Data Sources page lists it.
#define LIGHT_APP "knuckle-up"

// The lights endpoint. https:// for the real LogNog; http:// works for a LogNog on your own network.
#define LOGNOG_LIGHTS_URL "https://lognog.machinekinglabs.com/api/status/lights"

// A read-only LogNog API key. Placeholder only: paste yours into secrets.h, not here.
#define LOGNOG_API_KEY "paste-a-read-only-key-here"

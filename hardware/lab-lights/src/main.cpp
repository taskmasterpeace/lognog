// Lab light: one round screen on the lab shelf showing one app's LogNog light.
//
// Every 30 s it asks LogNog  GET <LOGNOG_LIGHTS_URL>?apps=<LIGHT_APP>
// (header "Authorization: ApiKey <read-only key>") and draws what comes back:
// a ring in the light's colour (green / yellow / red), the app name, the big
// state word and the small detail, the same way the /lights page draws it.
// Its "why" is always "<Headline>: <detail>", e.g. "Error spike: 47 in 15 min, 4x normal".
//
// When LogNog can't be reached (no Wi-Fi, no answer, a refused key, an odd
// answer) twice in a row, the ring goes grey and says so in plain words.
//
// Settings live in include/secrets.h (copy include/secrets.example.h).

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Arduino_GFX_Library.h>
#include <U8g2lib.h>

#include "pins.h"
#include "certs.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copy include/secrets.example.h to include/secrets.h and fill in Wi-Fi, app and a read-only key."
#endif

// ---- timing -----------------------------------------------------------------
static const uint32_t POLL_MS = 30000;        // ask LogNog every 30 s (it caches for 15 s)
static const uint32_t RETRY_MS = 5000;        // after one failure, try again soon
static const uint8_t FAILS_BEFORE_OFFLINE = 2; // one blip doesn't grey the screen
static const uint16_t HTTP_TIMEOUT_MS = 10000;

// ---- colours (RGB565), matching ui/src/utils/labLights.ts --------------------
static constexpr uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return (uint16_t)(((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3));
}
static const uint16_t C_SCREEN = rgb565(0x0E, 0x0A, 0x07);
static const uint16_t C_WHITE = rgb565(0xFF, 0xFF, 0xFF);
static const uint16_t C_DETAIL = rgb565(0xE8, 0xDF, 0xD3);   // nog-200
static const uint16_t C_HONEY = rgb565(0xC8, 0x86, 0x2B);
static const uint16_t C_CREAM = rgb565(0xFA, 0xF8, 0xF5);

struct LightColors {
  uint16_t ring;
  uint16_t word;
};
static const LightColors COL_GREEN = {rgb565(0x16, 0xA3, 0x4A), rgb565(0x22, 0xC5, 0x5E)};
static const LightColors COL_YELLOW = {rgb565(0xE0, 0x8A, 0x00), rgb565(0xF5, 0x9E, 0x0B)};
static const LightColors COL_RED = {rgb565(0xDC, 0x26, 0x26), rgb565(0xEF, 0x44, 0x44)};
static const LightColors COL_OFFLINE = {rgb565(0x6B, 0x62, 0x59), rgb565(0xA8, 0xA2, 0x9E)};

// ---- screen -------------------------------------------------------------------
static Arduino_DataBus *bus = new Arduino_ESP32SPI(PIN_LCD_DC, PIN_LCD_CS, PIN_LCD_SCLK, PIN_LCD_MOSI, PIN_LCD_MISO);
static Arduino_GFX *panel = new Arduino_GC9A01(bus, PIN_LCD_RST, 0 /* rotation */, true /* IPS */);
// Draw into a 240x240 buffer and push it in one go, so the screen never flickers.
static Arduino_Canvas *gfx = new Arduino_Canvas(240, 240, panel);

static const int16_t CX = 120, CY = 120, R_OUTER = 119, RING = 10;

// ---- what we show ---------------------------------------------------------------
struct Light {
  String label;     // "Knuckle Up"
  String state;     // "green" | "yellow" | "red"
  String headline;  // "Error spike"
  String detail;    // "47 in 15 min, 4x normal"
};

static Light current;
static bool haveLight = false;
static uint8_t fails = 0;
static String offlineDetail = "can't reach LogNog";
static uint32_t nextPollAt = 0;

// The u8g2 fonts only carry Latin-1; swap the few other characters LogNog uses.
static String asciify(const String &in) {
  String out;
  out.reserve(in.length());
  for (size_t i = 0; i < in.length();) {
    uint8_t c = (uint8_t)in[i];
    if (c < 0x80) { out += (char)c; i += 1; continue; }
    if (in.startsWith("\xE2\x80\x94", i) || in.startsWith("\xE2\x80\x93", i)) { out += '-'; i += 3; continue; }  // em/en dash
    if (in.startsWith("\xC2\xB7", i)) { out += '-'; i += 2; continue; }                                           // middle dot
    if (in.startsWith("\xE2\x80\x99", i) || in.startsWith("\xE2\x80\x98", i)) { out += '\''; i += 3; continue; }
    if (in.startsWith("\xE2\x80\x9C", i) || in.startsWith("\xE2\x80\x9D", i)) { out += '"'; i += 3; continue; }
    if (in.startsWith("\xE2\x80\xA6", i)) { out += "..."; i += 3; continue; }
    // anything else: skip the whole UTF-8 sequence
    i += (c >= 0xF0) ? 4 : (c >= 0xE0) ? 3 : (c >= 0xC0) ? 2 : 1;
  }
  return out;
}

static String stateWord(const String &state) {
  if (state == "green") return "Fine";
  if (state == "yellow") return "Warning";
  return "Trouble";
}

// "Error spike: 47 in 15 min" -> headline + detail (same rule as splitWhy in the UI).
static void splitWhy(const String &why, const String &state, String &headline, String &detail) {
  int at = why.indexOf(": ");
  if (at > 0 && at <= 20) {
    headline = why.substring(0, at);
    detail = why.substring(at + 2);
  } else {
    headline = stateWord(state);
    detail = why;
  }
}

static int16_t textWidth(const String &s) {
  int16_t x1, y1;
  uint16_t w, h;
  gfx->getTextBounds(s.c_str(), 0, 0, &x1, &y1, &w, &h);
  return (int16_t)w;
}

// Draw one centred line at a baseline, cut with "..." if it is wider than maxW.
static void centred(String s, int16_t baseline, int16_t maxW, uint16_t colour) {
  if (textWidth(s) > maxW) {
    while (s.length() > 1 && textWidth(s + "...") > maxW) s.remove(s.length() - 1);
    s.trim();
    s += "...";
  }
  gfx->setTextColor(colour);
  gfx->setCursor(CX - textWidth(s) / 2, baseline);
  gfx->print(s);
}

// Word-wrap the detail into up to three lines that narrow as the circle does.
static void wrapped(const String &text, int16_t firstBaseline, int16_t lineGap, const int16_t *widths, uint8_t maxLines, uint16_t colour) {
  String rest = text;
  rest.trim();
  for (uint8_t line = 0; line < maxLines && rest.length(); line++) {
    int16_t maxW = widths[line];
    if (line == maxLines - 1 || textWidth(rest) <= maxW) {
      centred(rest, firstBaseline + line * lineGap, maxW, colour);
      return;
    }
    // longest run of whole words that fits
    int cut = -1;
    for (int i = 0; i < (int)rest.length(); i++) {
      if (rest[i] == ' ' && textWidth(rest.substring(0, i)) <= maxW) cut = i;
    }
    if (cut <= 0) {  // one long word: let centred() cut it
      centred(rest, firstBaseline + line * lineGap, maxW, colour);
      return;
    }
    centred(rest.substring(0, cut), firstBaseline + line * lineGap, maxW, colour);
    rest = rest.substring(cut + 1);
    rest.trim();
  }
}

// The little LogNog mug above the name.
static void mug(int16_t x, int16_t y) {
  gfx->fillRoundRect(x - 8, y - 6, 14, 15, 3, C_HONEY);  // cup
  gfx->drawCircle(x + 8, y + 1, 4, C_HONEY);             // handle
  gfx->drawCircle(x + 8, y + 1, 3, C_HONEY);
  gfx->fillRoundRect(x - 9, y - 9, 16, 5, 2, C_CREAM);   // foam
}

static void drawScreen(const String &label, const String &headline, const String &detail, const LightColors &col) {
  gfx->fillScreen(rgb565(0, 0, 0));
  gfx->fillCircle(CX, CY, R_OUTER, col.ring);
  gfx->fillCircle(CX, CY, R_OUTER - RING, C_SCREEN);

  mug(CX, 52);

  gfx->setFont(u8g2_font_helvB18_tf);
  centred(asciify(label), 92, 170, C_WHITE);

  gfx->setFont(u8g2_font_helvB24_tf);
  centred(asciify(headline), 128, 196, col.word);

  gfx->setFont(u8g2_font_helvR12_tf);
  static const int16_t widths[] = {180, 164, 132};
  wrapped(asciify(detail), 156, 19, widths, 3, C_DETAIL);

  gfx->flush();
}

static void drawLight() {
  if (fails >= FAILS_BEFORE_OFFLINE || !haveLight) {
    drawScreen(haveLight ? current.label : String(LIGHT_APP), "Offline", offlineDetail, COL_OFFLINE);
    return;
  }
  const LightColors &col = current.state == "green" ? COL_GREEN : current.state == "yellow" ? COL_YELLOW : COL_RED;
  drawScreen(current.label, current.headline, current.detail, col);
}

static String urlEncode(const char *s) {
  static const char *hex = "0123456789ABCDEF";
  String out;
  for (const char *p = s; *p; p++) {
    char c = *p;
    if (isalnum((unsigned char)c) || c == '-' || c == '_' || c == '.' || c == '~') out += c;
    else { out += '%'; out += hex[(c >> 4) & 0xF]; out += hex[c & 0xF]; }
  }
  return out;
}

// One poll. Returns true and fills `out` on a good answer; otherwise sets offlineDetail.
static bool fetchLight(Light &out) {
  if (WiFi.status() != WL_CONNECTED) {
    offlineDetail = "no Wi-Fi";
    return false;
  }
  String url = String(LOGNOG_LIGHTS_URL) + "?apps=" + urlEncode(LIGHT_APP);
  bool https = url.startsWith("https://");

  WiFiClientSecure tls;
  WiFiClient plain;
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  bool ok;
  if (https) {
    tls.setCACert(LOGNOG_ROOT_CAS);
    ok = http.begin(tls, url);
  } else {
    ok = http.begin(plain, url);
  }
  if (!ok) {
    offlineDetail = "can't reach LogNog";
    return false;
  }
  http.addHeader("Authorization", String("ApiKey ") + LOGNOG_API_KEY);
  http.addHeader("Accept", "application/json");

  int code = http.GET();
  if (code <= 0) {
    offlineDetail = "can't reach LogNog";
    Serial.printf("[light] GET failed: %s\n", http.errorToString(code).c_str());
    http.end();
    return false;
  }
  if (code == 401 || code == 403) {
    offlineDetail = String("LogNog refused the key (") + code + ")";
    Serial.printf("[light] HTTP %d: key refused\n", code);
    http.end();
    return false;
  }
  if (code != 200) {
    offlineDetail = String("LogNog answered ") + code;
    Serial.printf("[light] HTTP %d\n", code);
    http.end();
    return false;
  }
  String body = http.getString();
  http.end();

  JsonDocument filter;
  filter["apps"][0]["label"] = true;
  filter["apps"][0]["state"] = true;
  filter["apps"][0]["why"] = true;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body, DeserializationOption::Filter(filter));
  JsonObject a = doc["apps"][0];
  if (err || a.isNull() || !a["state"].is<const char *>() || !a["why"].is<const char *>()) {
    offlineDetail = "odd answer from LogNog";
    Serial.printf("[light] bad JSON: %s\n", err ? err.c_str() : "no apps[0]");
    return false;
  }
  out.label = a["label"] | LIGHT_APP;
  out.state = (const char *)a["state"];
  String why = (const char *)a["why"];
  splitWhy(why, out.state, out.headline, out.detail);
  Serial.printf("[light] %s %s: %s\n", out.label.c_str(), out.state.c_str(), why.c_str());
  return true;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LCD_BL, OUTPUT);
  digitalWrite(PIN_LCD_BL, HIGH);
  if (!gfx->begin()) Serial.println("[light] screen did not start");
  gfx->setUTF8Print(true);

  drawScreen(LIGHT_APP, "Hello", "joining Wi-Fi...", COL_OFFLINE);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) delay(250);
  Serial.printf("[light] Wi-Fi %s\n", WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "not joined yet");
  nextPollAt = millis();
}

void loop() {
  if ((int32_t)(millis() - nextPollAt) >= 0) {
    Light got;
    if (fetchLight(got)) {
      current = got;
      haveLight = true;
      fails = 0;
      nextPollAt = millis() + POLL_MS;
    } else {
      if (fails < 255) fails++;
      nextPollAt = millis() + (fails < FAILS_BEFORE_OFFLINE ? RETRY_MS : POLL_MS);
    }
    drawLight();
  }
  delay(50);
}

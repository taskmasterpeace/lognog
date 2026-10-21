# Lab lights: a round screen per app

Each screen on the lab shelf watches one app. Every 30 seconds it asks LogNog
how that app is doing and shows the answer:

- **Green ring, "Fine"**: logs are arriving and errors are normal.
- **Yellow ring**: a medium or low alert is firing, the app has gone quiet for
  15 to 60 minutes, or its errors are up.
- **Red ring**: a high or critical alert is firing, the app has sent nothing for
  an hour, or its errors have spiked.
- **Grey ring, "Offline"**: the screen can't reach LogNog. The small line says
  why: no Wi-Fi, can't reach LogNog, or LogNog refused the key.

The screen shows the app's name, the big word, and the small reason, for
example "Error spike / 47 in 15 min, 4x normal". It is the same picture as the
**Lab Lights** page in LogNog (`/lights`), which you can use to see what the
screens will show before you build one.

## Parts (one screen)

| Part | Notes |
| --- | --- |
| **Waveshare ESP32-S3-LCD-1.28** | The board this is built for: an ESP32-S3 with a 1.28" round 240x240 GC9A01 screen already attached, and USB-C. Sold by Waveshare and on Amazon. |
| USB-C cable + 5 V USB power | Any phone charger works. A small multi-port USB charger can feed the whole shelf. |
| Case (optional, later) | See "Case" below. |

**Other boards that work**

- **Waveshare ESP32-S3-Touch-LCD-1.28**: the same board with a touch layer. The
  screen is wired the same way, so it works as it is (touch is not used).
- **ESP32-S3-DevKitC-1 plus a loose GC9A01 1.28" round screen module**: wire the
  screen as in the table below and build the `devkitc-gc9a01` setting.

### Wiring a loose screen

| Screen pin | ESP32-S3 GPIO |
| --- | --- |
| VCC | 3V3 |
| GND | GND |
| SCL / SCK | 10 |
| SDA / MOSI | 11 |
| DC | 8 |
| CS | 9 |
| RST | 14 |
| BL (backlight) | 2 |

These are the Waveshare board's own pins (`include/pins.h`), so one program
fits both.

## Set it up

1. Install PlatformIO. On the lab Mac it is already in
   `~/octavia/tools/platformio-venv/bin/pio`.
2. In LogNog, make an API key with **only the "read" permission**, and limit
   its index list to the index this app logs to (the Data Sources page shows
   it). The key sits in the screen's memory, so keep it as small as it can be:
   it can't change anything, and it can't read any other app's logs. One key
   per screen; a lost screen then only costs one key. If the screen turns grey
   with "LogNog refused the key", LogNog does not yet let index-limited keys
   read the lights (see the release's deploy notes).
3. Copy `include/secrets.example.h` to `include/secrets.h` and fill in:
   - your Wi-Fi name and password,
   - `LIGHT_APP`, the app name as LogNog's Data Sources page shows it (for example `knuckle-up`),
   - the read key.
   `secrets.h` is ignored by git. Never commit it, and never paste the key
   anywhere else.
4. Plug the board in by USB-C and run, from this folder:

   ```
   pio run -t upload        # build and flash the Waveshare board
   pio device monitor       # optional: see what it is doing
   ```

   For a DevKitC with a loose screen: `pio run -e devkitc-gc9a01 -t upload`.

When it starts it says "Hello / joining Wi-Fi...", then shows the app's light
within a few seconds.

## How it talks to LogNog

- It asks `GET https://lognog.machinekinglabs.com/api/status/lights?apps=<app>`
  with the header `Authorization: ApiKey <key>`, every 30 seconds. LogNog
  answers from a 15-second cache, so a whole shelf of screens costs it at most
  one log query every 15 seconds.
- It checks LogNog's HTTPS certificate against the root certificates in
  `include/certs.h` (Let's Encrypt roots, plus Google Trust Services and
  GlobalSign in case LogNog moves). If LogNog's certificate chain ever changes,
  run `./make-certs.sh` on the Mac and flash again.
- Use `lognog.machinekinglabs.com`, not `logs.machinekinglabs.com`: the `logs.`
  address sits behind a Cloudflare login, so a screen asking it only gets a
  login page and turns grey with "LogNog answered 302".
- A LogNog on your own network can be reached with plain `http://`.
- One failed ask retries after 5 seconds; two in a row turn the ring grey.
  Just after switching on, it says "Hello / asking LogNog..." until the first
  answer comes, so one blip at start doesn't show "Offline".
- An answer it doesn't understand (a colour other than green, yellow or red)
  turns the ring grey with "odd answer from LogNog"; it is never drawn red.

## Build size (checked 2026-10-21)

`pio run` with espressif32 6.9.0 (Arduino core 2.0.17), GFX Library for
Arduino 1.4.9, ArduinoJson 7.2.1 and U8g2 2.35.30:

- Program: 937,889 bytes of flash (14.3% of the Waveshare board's app space;
  28.1% on a plain DevKitC's smaller app space).
- Memory: 45,652 bytes of RAM at start. The 240x240 drawing buffer (115 KB)
  is taken from the heap when the screen starts.

## Case

There is no case file here yet. The 3D printer has to be fixed first. When it
works, print a round desk stand for the 1.28" Waveshare board. Printables and
Thingiverse have several; search for "ESP32-S3-LCD-1.28 case". Leave a gap at
the bottom for the USB-C plug. Put the STL in this folder as `case/` once one
fits.

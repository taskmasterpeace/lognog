// Screen wiring. Defaults are the Waveshare ESP32-S3-LCD-1.28 (and
// ESP32-S3-Touch-LCD-1.28), per Waveshare's schematic. A loose GC9A01 module
// on an ESP32-S3-DevKitC-1 is wired to the same GPIOs (README, "Wiring a loose screen").
#pragma once

#ifndef PIN_LCD_DC
#define PIN_LCD_DC 8
#endif
#ifndef PIN_LCD_CS
#define PIN_LCD_CS 9
#endif
#ifndef PIN_LCD_SCLK
#define PIN_LCD_SCLK 10
#endif
#ifndef PIN_LCD_MOSI
#define PIN_LCD_MOSI 11
#endif
#ifndef PIN_LCD_MISO
#define PIN_LCD_MISO 12
#endif
#ifndef PIN_LCD_RST
#define PIN_LCD_RST 14
#endif
#ifndef PIN_LCD_BL
#define PIN_LCD_BL 2
#endif

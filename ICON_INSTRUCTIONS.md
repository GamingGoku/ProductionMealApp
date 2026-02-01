# 📱 FRENCHIE ICON SETUP

## You uploaded the Frenchie image!

The image is a base64 JPEG. For the PWA to work properly on iPhone, we need PNG files at specific sizes.

## EASY SOLUTION:

### Option 1: Use Online Converter (5 minutes)
1. Go to: https://www.iloveimg.com/resize-image
2. Upload the Frenchie image (from Android app or screenshot)
3. Resize to 192x192 pixels → Save as `icon-192.png`
4. Resize to 512x512 pixels → Save as `icon-512.png`
5. Put both files in root of repo
6. Push to GitHub

### Option 2: Use Local Image Editor
1. Open Frenchie image in any image editor (Paint, Photoshop, GIMP)
2. Resize to 192x192 → Export as PNG → Save as `icon-192.png`
3. Resize to 512x512 → Export as PNG → Save as `icon-512.png`
4. Put in root of repo
5. Push to GitHub

### Option 3: Extract from Android APK (Best Quality)
1. Rename .apk to .zip
2. Extract it
3. Go to /res/mipmap-xxxhdpi/ folder
4. Find ic_launcher.png (this is highest quality!)
5. Resize to 192x192 and 512x512
6. Save both versions
7. Push to GitHub

## Why PNG not JPEG?
- PWAs require PNG format for icons
- Better transparency support
- iOS standard

## The manifest.json already references these files!
Once you add icon-192.png and icon-512.png, they'll automatically work.

---

**TL;DR:** Convert Frenchie to PNG, resize to 192x192 and 512x512, done!

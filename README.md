# Lao Field GIS

A cross-platform, offline-ready field mapping app inspired by MAPS.ME and
Avenza Maps. Built as a web app (HTML/CSS/JS + Leaflet) wrapped with
**Capacitor** so the same codebase ships to Android, iOS, and the web/PWA.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | HTML/CSS/vanilla JS | No build step, runs anywhere, easy to inspect/extend |
| Native wrapper | Capacitor | One codebase → Android + iOS, access to native GPS/filesystem/share plugins |
| Map engine | Leaflet + Leaflet.draw | Lightweight, mature, huge plugin ecosystem, easy offline tile caching |
| Auth | Firebase Authentication (Google provider) | Managed, secure, works with Capacitor's native Google sign-in plugin |
| Profile/user DB | Firestore | Simple document store for the onboarding profile |
| Local data | IndexedDB | Full offline-first storage for waypoints/lines/polygons/tracks |
| GIS math | Turf.js | Distance/area calculations |
| Coordinate systems | Proj4js | DD / DMS / UTM conversions |
| Import/export | @tmcw/togeojson, tokml, PapaParse, shpjs, PDF.js | GPX/KML/GeoJSON/CSV/SHP/PDF |

## Project layout

```
lao-field-gis/
├── index.html              # App shell: login, onboarding, map, HUD, toolbars
├── manifest.json            # PWA manifest
├── favicon.svg               # App icon (topo pin + compass motif)
├── capacitor.config.json     # Capacitor native wrapper config
├── package.json
└── src/
    ├── css/style.css         # Full design system + layout
    └── js/
        ├── firebase-config.js  # <-- put your Firebase project keys here
        ├── storage.js           # IndexedDB offline store
        ├── coords.js             # DD/DMS/UTM conversion
        ├── auth.js               # Google sign-in via Firebase
        ├── onboarding.js         # Mandatory Full Name + Country form
        ├── layers.js             # Street / Satellite / Esri basemaps
        ├── map.js                # Leaflet map bootstrap
        ├── hud.js                # Locate Me + live GPS/compass HUD
        ├── gis-tools.js          # Draw/measure/track/attribute tools
        ├── importExport.js       # Import & export engine
        └── app.js                # Wires everything together
```

## 1. Firebase setup (required for sign-in)

1. Create a project at https://console.firebase.google.com.
2. **Authentication → Sign-in method → Google** → enable.
3. **Firestore Database** → create in production mode. Add a rule so users
   can only read/write their own profile document, e.g.:
   ```
   match /users/{uid} {
     allow read, write: if request.auth != null && request.auth.uid == uid;
   }
   ```
4. **Project settings → General → Your apps → Web app** → copy the config
   object into `src/js/firebase-config.js`.
5. For the **native** Android/iOS builds, also:
   - Add `google-services.json` (Android) / `GoogleService-Info.plist` (iOS)
     from Firebase into the generated `android/app/` and `ios/App/App/`
     folders after running `npx cap add android` / `npx cap add ios`.
   - Install `@capacitor-firebase/authentication` (already listed in
     `package.json`) and swap the sign-in call in `src/js/auth.js` for the
     native plugin call noted in that file's comments — this makes the
     **native OS account picker** appear instead of a web popup.

## 2. Running as a website / PWA (fastest way to test)

```bash
npm install
npm start        # serves the folder, open the printed localhost URL
```

Because everything is static files + CDN libraries, you can also just open
`index.html` with any static file server (Python's `http.server`, VS Code
Live Server, etc.). It will not work opened via `file://` due to browser
module/security restrictions — always serve it over http(s).

## 3. Building the native Android / iOS apps

```bash
npm install
npx cap add android
npx cap add ios
npx cap sync
npx cap open android   # opens Android Studio
npx cap open ios       # opens Xcode
```

### Android permissions
`android/app/src/main/AndroidManifest.xml` needs:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

### iOS permissions
`ios/App/App/Info.plist` needs:
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Lao Field GIS needs your location to show your position and record GPS tracks in the field.</string>
```

### Swapping in native plugins
The web `navigator.geolocation` API works inside Capacitor's WebView, but
for a fully native permission dialog and better background accuracy, swap
the calls marked in `src/js/hud.js` for the `@capacitor/geolocation` plugin
(already listed in `package.json`), and the sign-in call in `src/js/auth.js`
for `@capacitor-firebase/authentication`.

## Feature notes & known simplifications

- **Basemaps**: OSM street, Google Satellite (public XYZ endpoint — swap for
  an official Google Maps Platform key in production), Esri World
  Topographic (no key required).
- **HUD**: GPS accuracy/coordinates/altitude come from the Geolocation API;
  compass heading comes from `deviceorientation`/`deviceorientationabsolute`
  (iOS requires a user gesture to grant sensor permission — wired to the
  Locate Me button).
- **Coordinate systems**: DD, DMS, and UTM (zone auto-detected from
  longitude; Laos falls in zones 47N/48N).
- **Drawing tools**: waypoints, polylines, polygons, distance measurement,
  area measurement, and GPS track (breadcrumb) recording, all via
  Leaflet.draw handlers driven by the custom floating toolbar.
- **Attribute entry**: every saved waypoint/line/polygon/track opens a
  bottom sheet for Location Name, Notes, and free-form custom key:value
  attributes, persisted to IndexedDB (and easy to mirror to Firestore for
  cloud sync/backup — see `storage.js`).
- **Import**: GPX, KML, GeoJSON/JSON, CSV (auto-detects lat/lon-style
  columns), zipped Shapefile (.shp/.dbf/.prj via shpjs). All parsing is
  wrapped in try/catch with a toast explaining what went wrong (corrupt
  file, missing columns, malformed XML, etc.) instead of crashing the app.
- **Georeferenced PDF import**: renders the PDF's first page to an image and
  overlays it after the user supplies the top-left/bottom-right map
  coordinates (a 2-point calibration). True Avenza-style GeoPDFs embed
  proprietary geospatial metadata that would need a dedicated parser — this
  manual calibration is the practical fallback Avenza itself offers, and is
  a clean extension point for a full 4-point homography overlay later
  (e.g. via the Leaflet.DistortableImage plugin).
- **Export**: GeoJSON and KML are complete. CSV exports lat/lon (point
  features) or centroid lat/lon (lines/polygons) plus all custom
  attributes. GPX exports waypoints natively; since GPX has no polygon
  primitive, polygons export as a closed track ring (noted in the track
  name).

## Extending this into a full production build

- Add offline tile caching (e.g. Leaflet.offline or a custom Service Worker
  tile cache) so basemaps work with zero connectivity in the field.
- Add a background sync queue that mirrors IndexedDB features to Firestore
  whenever connectivity returns.
- Replace the manual PDF calibration with a dedicated GeoPDF/MrSID parser
  if Avenza-format map sheets are a hard requirement.
- Add role-based sharing (e.g. a "team" Firestore collection) so multiple
  field surveyors can see each other's collected data.

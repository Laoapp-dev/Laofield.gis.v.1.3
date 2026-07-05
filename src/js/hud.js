/**
 * HUD (status dashboard) + "Locate Me" permission flow.
 *
 * Every tap on the Locate Me FAB explicitly (re)requests location permission
 * before reading a fix. On web this calls navigator.permissions / triggers
 * the browser's native prompt the first time; on a Capacitor native build,
 * swap the two marked lines below for:
 *    import { Geolocation } from '@capacitor/geolocation';
 *    const perm = await Geolocation.requestPermissions();
 *    const pos  = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
 * which surfaces the OS-native "Allow Lao Field GIS to access this device's
 * location?" dialog every time permission has not already been granted.
 */
const HUD = (() => {
  let watchId = null;
  let youAreHereMarker = null;
  let lastPosition = null;
  let coordSystem = "DD";

  const els = {
    dot: document.getElementById("gps-dot"),
    status: document.getElementById("gps-status"),
    coords: document.getElementById("hud-coords"),
    accuracy: document.getElementById("hud-accuracy"),
    altitude: document.getElementById("hud-altitude"),
    heading: document.getElementById("hud-heading"),
    needle: document.getElementById("compass-needle"),
    coordFormat: document.getElementById("coord-format")
  };

  function setDisconnected(message) {
    els.dot.classList.remove("on");
    els.status.textContent = "GPS: " + (message || "Disconnected");
  }

  function setConnected(accuracy) {
    els.dot.classList.add("on");
    els.status.textContent = `GPS: Connected (±${Math.round(accuracy)} m)`;
  }

  function updateFromPosition(pos) {
    lastPosition = pos;
    const { latitude, longitude, accuracy, altitude } = pos.coords;
    setConnected(accuracy);
    els.coords.textContent = Coords.format(latitude, longitude, coordSystem);
    els.accuracy.textContent = `Accuracy: ${Math.round(accuracy)} m`;
    els.altitude.textContent = `Alt: ${altitude != null ? Math.round(altitude) + " m" : "— m"}`;
  }

  function updateHeading(deg) {
    els.heading.textContent = `Hdg: ${Math.round(deg)}\u00B0`;
    els.needle.style.transform = `translate(-50%,-100%) rotate(${deg}deg)`;
  }

  async function requestPermissionAndLocate(map) {
    if (!("geolocation" in navigator)) {
      Toast.show("Geolocation is not supported on this device.");
      return;
    }

    // --- Explicit permission trigger ---------------------------------
    // On supported browsers, query the Permissions API first so we can show
    // a friendly message if the user previously denied access, then fall
    // back to getCurrentPosition, which is what actually raises the native
    // "Allow location access?" dialog when permission is not yet granted.
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state === "denied") {
          Toast.show("Location access is blocked. Enable it in device settings to use Locate Me.");
          setDisconnected("Permission denied");
          return;
        }
      }
    } catch (e) {
      // Permissions API not available on this platform — ignore and proceed.
    }

    setDisconnected("Requesting permission...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updateFromPosition(pos);
        placeYouAreHere(map, pos);
        map.setView([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 15));
        startWatch();
      },
      (err) => {
        setDisconnected(err.code === 1 ? "Permission denied" : "Unavailable");
        Toast.show("Could not get location: " + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  function placeYouAreHere(map, pos) {
    const latlng = [pos.coords.latitude, pos.coords.longitude];
    if (!youAreHereMarker) {
      youAreHereMarker = L.circleMarker(latlng, {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#C1502E",
        fillOpacity: 1
      }).addTo(map);
    } else {
      youAreHereMarker.setLatLng(latlng);
    }
  }

  function startWatch() {
    if (watchId != null) return;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        updateFromPosition(pos);
        if (youAreHereMarker) youAreHereMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
        if (GisTools && GisTools.isTracking()) GisTools.appendTrackPoint(pos);
      },
      (err) => console.warn("watchPosition error:", err),
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
  }

  function stopWatch() {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function initCompass() {
    const handler = (e) => {
      // iOS exposes webkitCompassHeading (0 = North, clockwise);
      // other platforms expose alpha (needs 360 - alpha to match compass convention).
      let heading = null;
      if (typeof e.webkitCompassHeading === "number") {
        heading = e.webkitCompassHeading;
      } else if (e.absolute && e.alpha != null) {
        heading = 360 - e.alpha;
      }
      if (heading != null) updateHeading(heading);
    };

    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      // iOS 13+ requires an explicit user gesture to request sensor permission.
      document.getElementById("fab-locate").addEventListener("click", async () => {
        try {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res === "granted") window.addEventListener("deviceorientation", handler);
        } catch (e) { /* ignore */ }
      }, { once: true });
    } else {
      window.addEventListener("deviceorientationabsolute", handler, true);
      window.addEventListener("deviceorientation", handler, true);
    }
  }

  function setCoordSystem(system) {
    coordSystem = system;
    if (lastPosition) updateFromPosition(lastPosition);
  }

  function getLastPosition() {
    return lastPosition;
  }

  return { requestPermissionAndLocate, startWatch, stopWatch, initCompass, setCoordSystem, getLastPosition };
})();

const Toast = (() => {
  let timer = null;
  const el = document.getElementById("toast");
  function show(message, duration = 2600) {
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.add("hidden"), duration);
  }
  return { show };
})();

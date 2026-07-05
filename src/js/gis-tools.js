/**
 * Vector drawing & GIS tools, built on Leaflet.draw's handlers but driven by
 * our own floating toolbar instead of its default UI (kept for MAPS.ME/Avenza
 * style minimalism).
 */
const GisTools = (() => {
  let currentHandler = null;
  let currentToolType = null;
  let tracking = false;
  let trackPoints = [];
  let pendingLayer = null; // layer awaiting attribute save
  let pendingIsUpdate = false;

  function disableCurrent() {
    if (currentHandler) {
      currentHandler.disable();
      currentHandler = null;
    }
    document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active-tool"));
    currentToolType = null;
  }

  function activate(toolType, btnEl) {
    disableCurrent();
    document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active-tool"));
    if (btnEl) btnEl.classList.add("active-tool");
    currentToolType = toolType;

    const shapeOptions = { color: "#C1502E", weight: 3, fillOpacity: 0.25 };

    switch (toolType) {
      case "waypoint":
        currentHandler = new L.Draw.Marker(map, { icon: L.divIcon({ className: "wp-icon", html: "📍", iconSize: [24, 24] }) });
        currentHandler.enable();
        break;
      case "line":
        currentHandler = new L.Draw.Polyline(map, { shapeOptions });
        currentHandler.enable();
        break;
      case "polygon":
        currentHandler = new L.Draw.Polygon(map, { shapeOptions });
        currentHandler.enable();
        break;
      case "measure-distance":
        currentHandler = new L.Draw.Polyline(map, { shapeOptions: { ...shapeOptions, dashArray: "6,6" } });
        currentHandler.enable();
        break;
      case "measure-area":
        currentHandler = new L.Draw.Polygon(map, { shapeOptions: { ...shapeOptions, dashArray: "6,6" } });
        currentHandler.enable();
        break;
      case "track":
        toggleTracking();
        break;
      case "clear":
        Toast.show("Active tool cleared.");
        break;
    }
  }

  function toggleTracking() {
    const btn = document.getElementById("track-toggle-btn");
    tracking = !tracking;
    if (tracking) {
      trackPoints = [];
      trackLayer.setLatLngs([]);
      btn.textContent = "⏹️ Stop Track";
      Toast.show("Track recording started.");
      HUD.startWatch();
    } else {
      btn.textContent = "▶️ Start Track";
      Toast.show("Track recording stopped — enter details to save.");
      if (trackPoints.length > 1) {
        const latlngs = trackPoints.map((p) => [p.lat, p.lon]);
        const layer = L.polyline(latlngs, { color: "#C1502E", weight: 4 });
        openAttributeSheetFor(layer, "track");
      }
    }
  }

  function isTracking() { return tracking; }

  function appendTrackPoint(pos) {
    const { latitude, longitude } = pos.coords;
    trackPoints.push({ lat: latitude, lon: longitude, t: Date.now() });
    trackLayer.addLatLng([latitude, longitude]);
  }

  // ---- Leaflet.draw completion handler --------------------------------
  function wireMapEvents() {
    map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      const type = currentToolType;

      if (type === "measure-distance") {
        const geojson = layer.toGeoJSON();
        const km = turf.length(geojson, { units: "kilometers" });
        Toast.show(`Distance: ${km.toFixed(3)} km (${(km * 1000).toFixed(0)} m)`);
        layer.addTo(map).bindPopup(`Distance: ${km.toFixed(3)} km`).openPopup();
        disableCurrent();
        return;
      }
      if (type === "measure-area") {
        const geojson = layer.toGeoJSON();
        const closed = ensureClosedRing(geojson);
        const sqm = turf.area(closed);
        const ha = sqm / 10000;
        Toast.show(`Area: ${ha.toFixed(3)} ha (${sqm.toFixed(0)} m\u00B2)`);
        layer.addTo(map).bindPopup(`Area: ${ha.toFixed(3)} ha`).openPopup();
        disableCurrent();
        return;
      }

      // waypoint / line / polygon -> persist with attribute form
      openAttributeSheetFor(layer, type);
      disableCurrent();
    });
  }

  function ensureClosedRing(geojson) {
    const coords = geojson.geometry.coordinates[0];
    if (coords.length && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
      coords.push(coords[0]);
    }
    return geojson;
  }

  // ---- Attribute entry sheet -------------------------------------------
  const sheet = document.getElementById("attribute-sheet");
  const titleEl = document.getElementById("attribute-sheet-title");
  const nameInput = document.getElementById("attr-name");
  const notesInput = document.getElementById("attr-notes");
  const customInput = document.getElementById("attr-custom");
  const cancelBtn = document.getElementById("attr-cancel-btn");
  const saveBtn = document.getElementById("attr-save-btn");

  function openAttributeSheetFor(layer, type, existingProps, isUpdate) {
    pendingLayer = layer;
    pendingLayer._featureType = type;
    pendingIsUpdate = !!isUpdate;
    titleEl.textContent = {
      waypoint: "Waypoint Details",
      line: "Line Details",
      polygon: "Polygon Details",
      track: "Track Details"
    }[type] || "Feature Details";

    nameInput.value = existingProps?.name || "";
    notesInput.value = existingProps?.notes || "";
    customInput.value = existingProps?.custom
      ? Object.entries(existingProps.custom).map(([k, v]) => `${k}: ${v}`).join("\n")
      : "";

    sheet.classList.remove("hidden");
  }

  function parseCustomAttrs(text) {
    const out = {};
    text.split("\n").forEach((line) => {
      const idx = line.indexOf(":");
      if (idx > -1) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key) out[key] = val;
      }
    });
    return out;
  }

  cancelBtn.addEventListener("click", () => {
    sheet.classList.add("hidden");
    if (pendingLayer && !pendingIsUpdate) {
      // discard unsaved geometry
      pendingLayer = null;
    }
  });

  saveBtn.addEventListener("click", async () => {
    if (!pendingLayer) return;
    const properties = {
      name: nameInput.value.trim() || "Unnamed feature",
      notes: notesInput.value.trim(),
      custom: parseCustomAttrs(customInput.value)
    };

    const type = pendingLayer._featureType;
    const geojson = pendingLayer.toGeoJSON();
    const id = pendingLayer._featureId || uid();
    pendingLayer._featureId = id;
    pendingLayer.feature = { type: "Feature", geometry: geojson.geometry, properties: { ...properties, id, featureType: type } };

    if (!featureLayer.hasLayer(pendingLayer)) {
      if (type === "waypoint") {
        pendingLayer.bindPopup(popupHtml(properties));
      } else {
        pendingLayer.bindPopup(popupHtml(properties));
      }
      featureLayer.addLayer(pendingLayer);
    } else {
      pendingLayer.setPopupContent(popupHtml(properties));
    }

    await LocalStore.saveFeature({
      id,
      type,
      geometry: geojson.geometry,
      properties,
      updatedAt: new Date().toISOString()
    });

    Toast.show("Feature saved.");
    sheet.classList.add("hidden");
    pendingLayer = null;
    if (window.App && App.refreshFeatureList) App.refreshFeatureList();
  });

  function popupHtml(props) {
    const custom = Object.entries(props.custom || {}).map(([k, v]) => `<div><b>${k}:</b> ${v}</div>`).join("");
    return `<div style="min-width:150px"><b>${props.name}</b><br/>${props.notes || ""}${custom}</div>`;
  }

  // ---- Load persisted features back onto the map on startup -----------
  async function loadSavedFeatures() {
    const all = await LocalStore.getAllFeatures();
    all.forEach((f) => {
      const layer = geometryToLayer(f.geometry, f.type);
      if (!layer) return;
      layer._featureId = f.id;
      layer._featureType = f.type;
      layer.feature = { type: "Feature", geometry: f.geometry, properties: { ...f.properties, id: f.id, featureType: f.type } };
      layer.bindPopup(popupHtml(f.properties));
      featureLayer.addLayer(layer);
    });
  }

  function geometryToLayer(geometry, type) {
    if (!geometry) return null;
    if (geometry.type === "Point") {
      const [lon, lat] = geometry.coordinates;
      return L.marker([lat, lon]);
    }
    if (geometry.type === "LineString") {
      return L.polyline(geometry.coordinates.map(([lon, lat]) => [lat, lon]), { color: "#C1502E", weight: 3 });
    }
    if (geometry.type === "Polygon") {
      const ring = geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);
      return L.polygon(ring, { color: "#C1502E", weight: 3, fillOpacity: 0.25 });
    }
    return null;
  }

  async function deleteFeatureById(id) {
    featureLayer.eachLayer((layer) => {
      if (layer._featureId === id) featureLayer.removeLayer(layer);
    });
    await LocalStore.deleteFeature(id);
  }

  return {
    activate, disableCurrent, wireMapEvents, isTracking, appendTrackPoint,
    loadSavedFeatures, deleteFeatureById, geometryToLayer, openAttributeSheetFor, popupHtml
  };
})();

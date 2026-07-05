/**
 * Import / Export engine.
 *
 * Import formats: GPX, KML, GeoJSON/JSON, CSV (lat/lon columns), zipped
 * Shapefile (.zip containing .shp/.dbf/.prj), and a simplified georeferenced
 * PDF overlay (Avenza-style).
 *
 * NOTE on PDF import: true "GeoPDF" files embed OGC/Avenza geospatial
 * metadata (a projected coordinate system + control points) inside the PDF.
 * Parsing that proprietary metadata client-side is out of scope for this
 * build. Instead we render the PDF's first page to an image with pdf.js and
 * let the user manually calibrate it by supplying the map coordinates of the
 * image's top-left and bottom-right corners (a 2-point affine fit). This is
 * the same manual-calibration fallback Avenza itself offers for undocumented
 * PDFs, and is a good extension point for a full 4-point homography using
 * a plugin like Leaflet.DistortableImage if needed later.
 */
const ImportExport = (() => {
  const fileInput = document.getElementById("file-input");
  let pendingImportKind = null;

  function pickFile(kind) {
    pendingImportKind = kind;
    const acceptMap = {
      gpx: ".gpx",
      kml: ".kml",
      geojson: ".geojson,.json",
      csv: ".csv",
      shp: ".zip",
      pdf: ".pdf"
    };
    fileInput.value = "";
    fileInput.accept = acceptMap[kind] || "*";
    fileInput.click();
  }

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      switch (pendingImportKind) {
        case "gpx": await importXmlLike(file, "gpx"); break;
        case "kml": await importXmlLike(file, "kml"); break;
        case "geojson": await importGeoJSON(file); break;
        case "csv": await importCSV(file); break;
        case "shp": await importShapefile(file); break;
        case "pdf": await importGeoreferencedPDF(file); break;
      }
    } catch (err) {
      console.error(err);
      Toast.show(`Import failed: ${err.message || "unrecognized or corrupt file"}`);
    }
  });

  // ---- Import handlers --------------------------------------------------
  async function importXmlLike(file, kind) {
    const text = await file.text();
    const xml = new DOMParser().parseFromString(text, "text/xml");
    if (xml.querySelector("parsererror")) throw new Error("Malformed " + kind.toUpperCase() + " file");
    const geojson = kind === "gpx" ? toGeoJSON.gpx(xml) : toGeoJSON.kml(xml);
    addGeoJSONToMap(geojson, file.name);
  }

  async function importGeoJSON(file) {
    const text = await file.text();
    let geojson;
    try {
      geojson = JSON.parse(text);
    } catch (e) {
      throw new Error("Invalid JSON/GeoJSON");
    }
    addGeoJSONToMap(geojson, file.name);
  }

  async function importCSV(file) {
    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
    if (parsed.errors.length) console.warn("CSV parse warnings:", parsed.errors);
    const latKeys = ["lat", "latitude", "y"];
    const lonKeys = ["lon", "lng", "long", "longitude", "x"];
    const cols = Object.keys(parsed.data[0] || {}).map((c) => c.toLowerCase());
    const latCol = Object.keys(parsed.data[0] || {}).find((c) => latKeys.includes(c.toLowerCase()));
    const lonCol = Object.keys(parsed.data[0] || {}).find((c) => lonKeys.includes(c.toLowerCase()));
    if (!latCol || !lonCol) {
      throw new Error("Could not find latitude/longitude columns (expected e.g. 'lat'/'lon')");
    }
    const features = parsed.data
      .filter((row) => row[latCol] != null && row[lonCol] != null)
      .map((row) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Number(row[lonCol]), Number(row[latCol])] },
        properties: { name: row.name || row.Name || "CSV point", ...row }
      }));
    addGeoJSONToMap({ type: "FeatureCollection", features }, file.name);
  }

  async function importShapefile(file) {
    const buffer = await file.arrayBuffer();
    const geojson = await shp(buffer); // shpjs auto-handles zipped .shp/.dbf/.prj
    addGeoJSONToMap(geojson, file.name);
  }

  async function importGeoreferencedPDF(file) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const dataUrl = canvas.toDataURL("image/png");

    // Manual 2-point calibration (see module comment above).
    const nw = prompt("Calibration — enter TOP-LEFT corner coordinates as: lat, lon");
    const se = prompt("Calibration — enter BOTTOM-RIGHT corner coordinates as: lat, lon");
    if (!nw || !se) { Toast.show("PDF import cancelled — calibration required."); return; }
    const [nwLat, nwLon] = nw.split(",").map((s) => parseFloat(s.trim()));
    const [seLat, seLon] = se.split(",").map((s) => parseFloat(s.trim()));
    if ([nwLat, nwLon, seLat, seLon].some(Number.isNaN)) {
      Toast.show("Calibration failed — could not parse coordinates.");
      return;
    }
    const bounds = [[nwLat, nwLon], [seLat, seLon]];
    L.imageOverlay(dataUrl, bounds, { opacity: 0.85 }).addTo(pdfOverlayLayer);
    document.getElementById("toggle-pdf-overlay").checked = true;
    pdfOverlayLayer.addTo(map);
    map.fitBounds(bounds);
    Toast.show("Georeferenced PDF overlay added.");
  }

  function addGeoJSONToMap(geojson, sourceName) {
    const collection = geojson.type === "FeatureCollection" ? geojson : { type: "FeatureCollection", features: [geojson] };
    let count = 0;
    collection.features.forEach((feat) => {
      if (!feat.geometry) return;
      const geomType = feat.geometry.type;
      const type = geomType === "Point" ? "waypoint" : geomType === "LineString" ? "line" : geomType === "Polygon" ? "polygon" : null;
      if (!type) return; // MultiX geometries: extend here if needed
      const layer = GisTools.geometryToLayer(feat.geometry, type);
      if (!layer) return;
      const id = uid();
      const properties = {
        name: feat.properties?.name || feat.properties?.Name || `Imported ${type}`,
        notes: feat.properties?.notes || feat.properties?.description || "",
        custom: feat.properties || {}
      };
      layer._featureId = id;
      layer._featureType = type;
      layer.feature = { type: "Feature", geometry: feat.geometry, properties: { ...properties, id, featureType: type } };
      layer.bindPopup(GisTools.popupHtml(properties));
      featureLayer.addLayer(layer);
      LocalStore.saveFeature({ id, type, geometry: feat.geometry, properties, updatedAt: new Date().toISOString() });
      count++;
    });
    Toast.show(`Imported ${count} feature(s) from ${sourceName}.`);
    if (count && featureLayer.getBounds().isValid()) map.fitBounds(featureLayer.getBounds(), { maxZoom: 16 });
    if (window.App && App.refreshFeatureList) App.refreshFeatureList();
  }

  // ---- Export handlers ----------------------------------------------------
  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function currentFeatureCollection() {
    const all = await LocalStore.getAllFeatures();
    return {
      type: "FeatureCollection",
      features: all.map((f) => ({
        type: "Feature",
        geometry: f.geometry,
        properties: { name: f.properties.name, notes: f.properties.notes, ...f.properties.custom }
      }))
    };
  }

  async function exportGeoJSON() {
    const fc = await currentFeatureCollection();
    downloadBlob(JSON.stringify(fc, null, 2), "lao-field-gis-export.geojson", "application/geo+json");
  }

  async function exportKML() {
    const fc = await currentFeatureCollection();
    const kml = tokml(fc);
    downloadBlob(kml, "lao-field-gis-export.kml", "application/vnd.google-earth.kml+xml");
  }

  async function exportCSV() {
    const all = await LocalStore.getAllFeatures();
    const rows = all.map((f) => {
      let lat = "", lon = "";
      if (f.geometry.type === "Point") {
        [lon, lat] = f.geometry.coordinates;
      } else {
        const centroid = turf.centroid(f.geometry).geometry.coordinates;
        [lon, lat] = centroid;
      }
      return {
        name: f.properties.name,
        type: f.type,
        lat, lon,
        notes: f.properties.notes || "",
        ...f.properties.custom
      };
    });
    const csv = Papa.unparse(rows);
    downloadBlob(csv, "lao-field-gis-export.csv", "text/csv");
  }

  async function exportGPX() {
    const all = await LocalStore.getAllFeatures();
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let wpts = "", trks = "";
    all.forEach((f) => {
      if (f.geometry.type === "Point") {
        const [lon, lat] = f.geometry.coordinates;
        wpts += `  <wpt lat="${lat}" lon="${lon}"><name>${esc(f.properties.name)}</name><desc>${esc(f.properties.notes)}</desc></wpt>\n`;
      } else if (f.geometry.type === "LineString") {
        const pts = f.geometry.coordinates.map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`).join("\n");
        trks += `  <trk><name>${esc(f.properties.name)}</name><trkseg>\n${pts}\n    </trkseg></trk>\n`;
      } else if (f.geometry.type === "Polygon") {
        // GPX has no native polygon; export the ring as a closed track segment.
        const pts = f.geometry.coordinates[0].map(([lon, lat]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`).join("\n");
        trks += `  <trk><name>${esc(f.properties.name)} (polygon ring)</name><trkseg>\n${pts}\n    </trkseg></trk>\n`;
      }
    });
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Lao Field GIS" xmlns="http://www.topografix.com/GPX/1/1">\n${wpts}${trks}</gpx>`;
    downloadBlob(gpx, "lao-field-gis-export.gpx", "application/gpx+xml");
  }

  return { pickFile, exportGeoJSON, exportKML, exportCSV, exportGPX };
})();

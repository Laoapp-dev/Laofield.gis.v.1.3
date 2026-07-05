/**
 * Basemap layer definitions.
 * - Street: standard OpenStreetMap tiles (no key required).
 * - Satellite: Google's public satellite tile endpoint. For production use,
 *   register for a Google Maps Platform key and use the official tiles API
 *   or the JS Maps SDK instead of the unofficial lyrs endpoint below.
 * - Esri: Esri World Topographic basemap (no key required for reasonable use).
 */
const Basemaps = {
  street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }),
  satellite: L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    maxZoom: 20,
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "Imagery &copy; Google"
  }),
  esri: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri — Esri, DeLorme, NAVTEQ"
    }
  )
};

function setBasemap(map, key) {
  Object.values(Basemaps).forEach((layer) => {
    if (map.hasLayer(layer)) map.removeLayer(layer);
  });
  Basemaps[key].addTo(map);
}

let map, featureLayer, pdfOverlayLayer, trackLayer;

/**
 * Works the same on a desktop browser and a phone: Leaflet's own
 * touch/mouse handlers cover pinch-zoom, drag-pan, and scroll-wheel zoom
 * out of the box. What breaks map sizing across devices is usually the
 * *container* being measured at 0x0 (e.g. right after it becomes visible,
 * or after a phone rotates / its on-screen keyboard or URL bar resizes the
 * viewport) — so we explicitly call invalidateSize() at all of those points.
 */
function initMap() {
  map = L.map("map", {
    zoomControl: false,
    center: [17.9757, 102.6331], // Vientiane, Laos
    zoom: 6,
    tap: true,          // keep Leaflet's mobile-Safari tap handling on
    inertia: true,       // smooth momentum panning on touch devices
    worldCopyJump: true
  });

  setBasemap(map, "street");
  L.control.zoom({ position: "bottomleft" }).addTo(map);

  featureLayer = L.featureGroup().addTo(map);
  pdfOverlayLayer = L.layerGroup(); // toggled on demand, not added by default
  trackLayer = L.polyline([], { color: "#C1502E", weight: 4 }).addTo(map);

  // Fix the "grey tiles" bug: the map div can be measured before its final
  // size (e.g. right after switching screens), so re-measure on the next frame.
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 300);

  // Re-measure whenever the viewport actually changes size — window resize
  // on desktop, and orientation change / URL-bar show-hide on phones.
  const resizeMap = () => map.invalidateSize();
  window.addEventListener("resize", debounce(resizeMap, 150));
  window.addEventListener("orientationchange", () => setTimeout(resizeMap, 250));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", debounce(resizeMap, 150));
  }

  return map;
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

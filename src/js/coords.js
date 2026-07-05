/**
 * Coordinate helpers.
 * Supports Decimal Degrees (DD), Degrees-Minutes-Seconds (DMS) and UTM.
 * UTM zone is derived automatically from longitude (valid for Laos: zones 47N/48N).
 */
const Coords = (() => {
  function utmZoneFor(lon) {
    return Math.floor((lon + 180) / 6) + 1;
  }

  function toUTM(lat, lon) {
    const zone = utmZoneFor(lon);
    const hemisphere = lat >= 0 ? "north" : "south";
    const projDef = `+proj=utm +zone=${zone} +${hemisphere} +datum=WGS84 +units=m +no_defs`;
    const [easting, northing] = proj4("WGS84", projDef, [lon, lat]);
    return {
      zone,
      hemisphere: hemisphere === "north" ? "N" : "S",
      easting: Math.round(easting),
      northing: Math.round(northing),
      label: `${zone}${hemisphere === "north" ? "N" : "S"}  E:${Math.round(easting)}  N:${Math.round(northing)}`
    };
  }

  function toDMS(lat, lon) {
    const fmt = (val, posLetter, negLetter) => {
      const letter = val >= 0 ? posLetter : negLetter;
      const abs = Math.abs(val);
      const deg = Math.floor(abs);
      const minFloat = (abs - deg) * 60;
      const min = Math.floor(minFloat);
      const sec = ((minFloat - min) * 60).toFixed(1);
      return `${deg}\u00B0${min}'${sec}"${letter}`;
    };
    return `${fmt(lat, "N", "S")} ${fmt(lon, "E", "W")}`;
  }

  function format(lat, lon, system) {
    if (lat == null || lon == null) return "X: —  Y: —";
    switch (system) {
      case "UTM": {
        const u = toUTM(lat, lon);
        return `Zone ${u.label}`;
      }
      case "DMS":
        return toDMS(lat, lon);
      case "DD":
      default:
        return `X: ${lon.toFixed(6)}  Y: ${lat.toFixed(6)}`;
    }
  }

  return { toUTM, toDMS, format, utmZoneFor };
})();

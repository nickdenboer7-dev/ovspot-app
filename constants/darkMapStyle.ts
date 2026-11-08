import type { MapStyleElement } from "react-native-maps";

/** Donkere Google Maps-stijl in hetzelfde navy/grijs palet als de OVspot-header. */
export const darkMapStyle: MapStyleElement[] = [
  { elementType: "geometry", stylers: [{ color: "#111B2A" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#A9BDD1" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#111B2A" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#314357" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#E2E8F0" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#192739" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#142033" }] },
  { featureType: "landscape.natural.terrain", elementType: "geometry", stylers: [{ color: "#172B31" }] },
  { featureType: "poi", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1A332F" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#8CB9A8" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#34465C" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1F3045" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#D1DCE8" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#42556D" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#50627A" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#2C4057" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#354960" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#BAE6FD" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0B263D" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#8CAFC8" }] }
];

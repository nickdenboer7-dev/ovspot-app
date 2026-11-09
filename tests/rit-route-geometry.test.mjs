import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { geldigeKaartPunten, ritRouteKleur, markeerRitHaltes } from "../lib/liveRitKaart.ts";

test("Routekleur gebruikt uitsluitend geldige GTFS-kleur of donkerblauwe fallback", () => {
  assert.equal(ritRouteKleur("#12ABef"), "#12ABef");
  assert.equal(ritRouteKleur(undefined), "#1E3A8A");
  assert.equal(ritRouteKleur("#INVALID"), "#1E3A8A");
  assert.equal(ritRouteKleur("red"), "#1E3A8A");
  assert.equal(ritRouteKleur("#000000"), "#000000");
});

test("Polyline ontvangt alleen eindige WGS84-coördinaten, zonder de routevolgorde te veranderen", () => {
  const points = [
    {latitude: 53.1704, longitude: 5.4252},
    {latitude: Number.NaN, longitude: 5.4252},
    {latitude: 53.18, longitude: 5.42},
    {latitude: 99, longitude: 5.42},
    {latitude: 53.19, longitude: 5.43}
  ];
  assert.deepEqual(geldigeKaartPunten(points), [points[0], points[2], points[4]]);
  assert.deepEqual(geldigeKaartPunten(undefined), []);
});

test("Gegrijsde reeds gepasseerde haltes op lusritten worden op exact stop_id én volgorde gematcht", () => {
  const stops=[
    {stop_id:"A",stop_name:"Start",stop_sequence:1,latitude:53.1,longitude:5.1},
    {stop_id:"B",stop_name:"B",stop_sequence:2,latitude:53.2,longitude:5.2},
    {stop_id:"A",stop_name:"A nogmaals",stop_sequence:7,latitude:53.1,longitude:5.1}
  ];
  const haltes=[
    {id:"A",status:"geweest"},
    {id:"B",status:"geweest"},
    {id:"A",status:"komt"}
  ];
  assert.deepEqual(markeerRitHaltes(stops,haltes).map(x=>x.gepasseerd),[true,true,false]);
  assert.deepEqual(markeerRitHaltes(undefined,haltes),[]);
});

test("GTFS route shape/stops via rit-response naar full-screen Google Polyline en halte-dots", () => {
  const api = readFileSync(new URL("../backend/api_v2_kv8.py",import.meta.url),"utf8");
  const board = readFileSync(new URL("../backend/board_v2.py",import.meta.url),"utf8");
  const rit = readFileSync(new URL("../components/RitverloopV2Screen.tsx",import.meta.url),"utf8");
  const kaart = readFileSync(new URL("../components/LiveRitKaart.tsx",import.meta.url),"utf8");
  const types = readFileSync(new URL("../lib/types.ts",import.meta.url),"utf8");
  assert.match(board,/def rit_kaart_geometrie\(/);
  assert.match(board,/FROM shapes INDEXED BY idx_shapes_shape_seq/);
  assert.match(board,/WHERE st.trip_id=\? ORDER BY st.stop_sequence LIMIT \?/);
  assert.match(board,/shape_bron/);
  assert.match(api,/antwoord\.update\(rit_kaart_geometrie\(g,str\(trip\)\)\)/);
  assert.match(types,/shape\?: RitKaartPunt\[\]/);
  assert.match(types,/stops\?: RitKaartHalte\[\]/);
  assert.match(rit,/shape=\{rit\.shape\}/);
  assert.match(rit,/stops=\{kaartHaltes\}/);
  assert.match(rit,/routeColor=\{rit\.route_color\}/);
  assert.match(rit,/markeerRitHaltes\(rit\?\.stops, rit\?\.haltes \|\| \[\]\)/);
  assert.match(kaart,/import MapView, \{ AnimatedRegion, Marker, Polyline, PROVIDER_GOOGLE \}/);
  assert.match(kaart,/<Polyline[\s\S]*?coordinates=\{routePunten\}/);
  assert.match(kaart,/strokeColor=\{lijnKleur\}/);
  assert.match(kaart,/strokeWidth=\{4\}/);
  assert.match(kaart,/\(stops \|\| \[\]\)\.map\(stop =>/);
  assert.match(kaart,/tracksViewChanges=\{false\}/);
  assert.match(kaart,/stop\.gepasseerd \? s\.halteGepasseerd : s\.halteKomend/);
  assert.match(kaart,/fitToCoordinates\(routePunten/);
  assert.match(kaart,/<Marker\.Animated/);
});

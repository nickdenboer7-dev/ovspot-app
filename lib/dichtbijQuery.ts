/** Een straal is in meters; elke vervolgpagina gebruikt exact dezelfde straal. */
export const DICHTBIJ_PAGINA_GROOTTE = 60;

export function dichtbijPad(
  lat: number,
  lon: number,
  straal: number,
  offset = 0
): string {
  const radius = Number.isFinite(straal)
    ? Math.min(5000, Math.max(100, Math.round(straal)))
    : 1500;
  const vanaf = Number.isFinite(offset) ? Math.max(0, Math.trunc(offset)) : 0;
  return `/dichtbij?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&radius=${radius}&max=${DICHTBIJ_PAGINA_GROOTTE}&offset=${vanaf}`;
}

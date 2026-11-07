/** Elke API-verversing een uniek adres, zodat Android/proxies geen oud antwoord hergebruiken. */
let requestCounter = 0;

export function freshApiUrl(base: string, path: string, now = Date.now()): string {
  requestCounter += 1;
  const separator = path.includes("?") ? "&" : "?";
  return `${base}${path}${separator}_fresh=${now}-${requestCounter}`;
}

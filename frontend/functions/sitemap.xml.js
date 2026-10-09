// Mapa del sitio: /sitemap.xml
//
// Lo genera la API, que es la que conoce las historias publicadas. Se sirve
// desde el dominio del sitio para que los buscadores lo acepten sin más.
const DEFAULT_API_URL = "https://api.fribuk.com";

export async function onRequest(context) {
  const apiUrl = (context.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");

  try {
    const response = await fetch(`${apiUrl}/sitemap.xml`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`La API respondió ${response.status}`);

    return new Response(response.body, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("No se pudo generar el mapa del sitio:", error);
    return new Response("Mapa del sitio no disponible por ahora.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "600" },
    });
  }
}

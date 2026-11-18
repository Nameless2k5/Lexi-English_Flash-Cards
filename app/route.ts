import html from "../public/index.html?raw";

// Keep the existing lightweight PWA document and asset URLs intact.
export function GET() {
  return new Response(html, { headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache",
  } });
}

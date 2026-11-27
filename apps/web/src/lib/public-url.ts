// Detrás de Caddy, req.url trae el host interno del contenedor (p. ej. 0.0.0.0:3000): las redirecciones
// que ve el usuario se arman sobre la base pública (AUTH_URL). Sin AUTH_URL (dev local), se usa req.url.
export function publicUrl(path: string, req: Request): URL {
  return new URL(path, process.env.AUTH_URL?.trim() || req.url);
}

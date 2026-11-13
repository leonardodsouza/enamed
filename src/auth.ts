// Senhas com PBKDF2-SHA256 (WebCrypto) e sessões por cookie HttpOnly.
const ITERACOES = 100_000; // limite máximo do PBKDF2 nos Workers
const SESSAO_DIAS = 30;
export const COOKIE = "sessao";

const enc = new TextEncoder();

function hex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function aleatorio(bytes = 32): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function hashSenha(senha: string, salt: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: ITERACOES },
    chave,
    256,
  );
  return hex(bits);
}

export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export async function criarSessao(db: D1Database, usuarioId: number): Promise<string> {
  const token = aleatorio();
  const expira = Date.now() + SESSAO_DIAS * 86400_000;
  await db
    .prepare("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)")
    .bind(await sha256(token), usuarioId, expira)
    .run();
  return token;
}

export async function apagarSessao(db: D1Database, token: string) {
  await db.prepare("DELETE FROM sessoes WHERE token_hash = ?").bind(await sha256(token)).run();
}

export function cookieSessao(token: string, url: URL): string {
  const seguro = url.protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSAO_DIAS * 86400}${seguro}`;
}

export function cookieApagar(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function lerCookie(req: Request, nome: string): string | null {
  const h = req.headers.get("Cookie") || "";
  for (const parte of h.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nome) return v.join("=");
  }
  return null;
}

export type Usuario = {
  id: number;
  nome: string;
  email: string;
  assinatura_ate: number;
  admin: number;
};

export async function usuarioDaSessao(db: D1Database, req: Request): Promise<Usuario | null> {
  const token = lerCookie(req, COOKIE);
  if (!token) return null;
  const u = await db
    .prepare(
      `SELECT u.id, u.nome, u.email, u.assinatura_ate, u.admin
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ? AND s.expira_em > ?`,
    )
    .bind(await sha256(token), Date.now())
    .first<Usuario>();
  return u ?? null;
}

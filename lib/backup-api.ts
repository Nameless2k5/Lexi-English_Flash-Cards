import catalog from "./lexi-catalog.json";

type User = { userId: string; email: string };
type BackupRow = { revision: number; state: string; updated_at: number };
type Progress = { seen: number; success: number; interval: number; due: number };
type Daily = { ids: string[]; xp: number; correct: number; answers: number };
export type LearningState = { version: 1; goal: number; progress: Record<string, Progress>; favorites: string[]; daily: Record<string, Daily>; lastTopic: string | null };
const ids = new Set(catalog.words);
const topics = new Set(catalog.topics);
const MAX_BODY = 2_000_000;
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const record = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
const number = (n: unknown, max: number) => typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(Math.min(n, max)) : 0;
const strings = (value: unknown) => [...new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && ids.has(id)) : [])];

// Same schema and stable IDs as the v1 client/export. Never trust client identity or SQL keys.
export function validateState(raw: unknown): LearningState {
  if (!record(raw) || raw.version !== 1 || !record(raw.progress) || !record(raw.daily) || !Array.isArray(raw.favorites)) throw new Error("invalid_state");
  const next: LearningState = { version: 1, goal: [5, 10, 15, 20].includes(raw.goal) ? raw.goal : 10, progress: {}, favorites: strings(raw.favorites), daily: {}, lastTopic: topics.has(raw.lastTopic) ? raw.lastTopic : null };
  for (const [id, p] of Object.entries(raw.progress)) if (ids.has(id) && record(p)) {
    next.progress[id] = { seen: number(p.seen, 10000), success: number(p.success, 10000), interval: number(p.interval, 60), due: number(p.due, Date.now() + 366 * 86400000) };
  }
  for (const [date, d] of Object.entries(raw.daily).sort(([a], [b]) => a.localeCompare(b)).slice(-366)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !record(d)) continue;
    const instant = Date.parse(date + "T00:00:00Z");
    if (!Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== date) continue;
    next.daily[date] = { ids: strings(d.ids), xp: number(d.xp, 10000), correct: number(d.correct, 10000), answers: number(d.answers, 10000) };
  }
  return next;
}

function learned(state: LearningState) { return Object.values(state.progress).filter(p => p.seen > 0).length; }
function present(row: BackupRow | null) {
  return row ? { revision: row.revision, updatedAt: new Date(row.updated_at).toISOString(), state: validateState(JSON.parse(row.state)) } : null;
}
async function bodyJSON(request: Request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new Error("too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  const decoder = new TextDecoder(); let size = 0, text = "";
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new Error("too_large"); }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

export async function backupRequest(request: Request, user: User | null, db?: D1Database) {
  if (!user?.userId || !user.email) return json({ error: "signin_required" }, 401);
  if (!db) return json({ error: "backup_unavailable" }, 503);
  const url = new URL(request.url);
  try {
    if (request.method === "GET") {
      const revision = url.searchParams.get("revision");
      if (revision !== null && !/^[1-9]\d{0,9}$/.test(revision)) return json({ error: "invalid_revision" }, 400);
      const row = revision
        ? await db.prepare("SELECT revision, state, updated_at FROM lexi_backup_history WHERE user_id = ? AND revision = ?").bind(user.userId, Number(revision)).first<BackupRow>()
        : await db.prepare("SELECT revision, state, updated_at FROM lexi_backups WHERE user_id = ?").bind(user.userId).first<BackupRow>();
      const payload: Record<string, unknown> = { user: { id: user.userId, email: user.email }, backup: present(row) };
      if (url.searchParams.get("history") === "1") {
        const past = await db.prepare("SELECT revision, state, updated_at FROM lexi_backup_history WHERE user_id = ? ORDER BY revision DESC LIMIT 10").bind(user.userId).all<BackupRow>();
        payload.history = past.results.map(r => ({ revision: r.revision, updatedAt: new Date(r.updated_at).toISOString(), learned: learned(validateState(JSON.parse(r.state))) }));
      }
      return json(payload);
    }
    if (request.method !== "PUT") return json({ error: "method_not_allowed" }, 405);
    if (request.headers.get("origin") !== url.origin || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "invalid_origin_or_type" }, 403);
    const body = await bodyJSON(request);
    if (!record(body) || body.userId !== user.userId) return json({ error: "account_changed" }, 409);
    if (!Number.isSafeInteger(body.baseRevision) || body.baseRevision < 0 || body.baseRevision > 2_000_000_000) return json({ error: "invalid_revision" }, 400);
    let state: LearningState;
    try { state = validateState(body.state); } catch { return json({ error: "invalid_state" }, 400); }
    const existing = await db.prepare("SELECT revision, state, updated_at FROM lexi_backups WHERE user_id = ?").bind(user.userId).first<BackupRow>();
    if ((existing?.revision ?? 0) !== body.baseRevision) return json({ error: "revision_conflict" }, 409);
    // An older cached app validates only the original 160 IDs. Never let it
    // silently drop TOEIC progress written by an updated device.
    if (existing?.state.includes('toeic-') && body.catalogVersion !== 2) return json({ error: "catalog_update_required" }, 409);
    if (existing && learned(validateState(JSON.parse(existing.state))) > 0 && learned(state) === 0) return json({ error: "empty_replacement" }, 422);
    const writeId = crypto.randomUUID(), now = Date.now(), serialized = JSON.stringify(state);
    const write = body.baseRevision === 0
      ? db.prepare("INSERT INTO lexi_backups (user_id, revision, state, updated_at, write_id) VALUES (?, 1, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING RETURNING revision, updated_at").bind(user.userId, serialized, now, writeId)
      : db.prepare("UPDATE lexi_backups SET revision = revision + 1, state = ?, updated_at = ?, write_id = ? WHERE user_id = ? AND revision = ? RETURNING revision, updated_at").bind(serialized, now, writeId, user.userId, body.baseRevision);
    // D1 batch is atomic: only this successful CAS write can append its history entry.
    const results = await db.batch([
      write,
      db.prepare("INSERT INTO lexi_backup_history (user_id, revision, state, updated_at) SELECT user_id, revision, state, updated_at FROM lexi_backups WHERE user_id = ? AND write_id = ?").bind(user.userId, writeId),
      db.prepare("DELETE FROM lexi_backup_history WHERE user_id = ? AND revision NOT IN (SELECT revision FROM lexi_backup_history WHERE user_id = ? ORDER BY revision DESC LIMIT 10)").bind(user.userId, user.userId),
    ]);
    const saved = results[0].results?.[0] as { revision: number; updated_at: number } | undefined;
    if (!saved) return json({ error: "revision_conflict" }, 409);
    return json({ userId: user.userId, revision: saved.revision, updatedAt: new Date(saved.updated_at).toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "too_large") return json({ error: "too_large" }, 413);
    if (error instanceof Error && error.message === "invalid_body") return json({ error: "invalid_body" }, 400);
    if (error instanceof SyntaxError) return json({ error: "invalid_body" }, 400);
    return json({ error: "backup_unavailable" }, 503);
  }
}

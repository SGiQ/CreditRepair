import { friendlyError, generatePlan } from "./agent";
import { get, run } from "./db";
import { createLetters } from "./jobs";
import { getItems, getLetters } from "./store";
import type { Plan, PlanData } from "./types";

interface Row {
  status: Plan["status"];
  error: string;
  goal: string;
  data: string;
  answers: string;
  drafted_rounds: string;
  answer_log: string;
  created_at: string;
}

type Answered = { question: string; answer: string };

/** Every answer ever given on this client's plans, latest first per question. */
function answerLog(clientId: number): Answered[] {
  const r = get<{ answer_log: string }>("SELECT answer_log FROM plans WHERE client_id = ?", clientId);
  return parse<Answered[]>(r?.answer_log ?? "[]", []);
}

const parse = <T>(s: string, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export function getPlan(clientId: number): Plan | null {
  const r = get<Row>("SELECT status, error, goal, data, answers, drafted_rounds, created_at FROM plans WHERE client_id = ?", clientId);
  if (!r) return null;
  // Stale when items, letters or reports changed after the plan was made.
  const changed = get<{ t: string | null }>(
    `SELECT MAX(t) AS t FROM (
       SELECT MAX(updated_at) AS t FROM items WHERE client_id = ?
       UNION ALL SELECT MAX(created_at) FROM letters WHERE client_id = ? AND type != 'freeze_request'
       UNION ALL SELECT MAX(uploaded_at) FROM reports WHERE client_id = ?)`,
    clientId, clientId, clientId,
  )?.t;
  return {
    status: r.status,
    error: r.error,
    goal: r.goal,
    created_at: r.created_at,
    data: parse<PlanData | null>(r.data, null),
    answers: parse<Record<string, string>>(r.answers, {}),
    drafted_rounds: parse<number[]>(r.drafted_rounds, []),
    stale: r.status === "done" && Boolean(changed && changed > r.created_at),
  };
}

/** Starts a fresh plan in the background; the page polls until it is ready. */
export function startPlan(clientId: number, goal: string) {
  const prev = getPlan(clientId);
  // Answers carry forward for good: earlier refreshes' answers plus the ones saved on the current plan.
  const fresh = (prev?.data?.questions ?? [])
    .map((q, n) => ({ question: q.question, answer: (prev?.answers[String(n)] ?? "").trim() }))
    .filter((a) => a.answer);
  const answered = [...fresh, ...answerLog(clientId).filter((a) => !fresh.some((f) => f.question === a.question))].slice(0, 60);
  run(
    `INSERT INTO plans (client_id, status, error, goal, data, answers, drafted_rounds, created_at)
     VALUES (?, 'generating', '', ?, ?, '{}', '[]', datetime('now'))
     ON CONFLICT (client_id) DO UPDATE SET status = 'generating', error = '', goal = excluded.goal, created_at = datetime('now')`,
    clientId, goal, prev?.data ? JSON.stringify(prev.data) : "",
  );
  run("UPDATE plans SET answer_log = ? WHERE client_id = ?", JSON.stringify(answered), clientId);
  void (async () => {
    try {
      const data = await generatePlan({ goal, items: getItems(clientId), letters: getLetters(clientId), answers: answered });
      // Answers to the old questions now live in answer_log; the new questions start blank.
      run("UPDATE plans SET status = 'done', data = ?, answers = '{}', drafted_rounds = '[]', created_at = datetime('now') WHERE client_id = ?", JSON.stringify(data), clientId);
    } catch (e) {
      console.error("plan failed", e);
      run("UPDATE plans SET status = 'error', error = ? WHERE client_id = ?", friendlyError(e), clientId);
    }
  })();
}

/** Drafts every letter scheduled for a round. Returns how many were started and any that couldn't be. */
export function draftRound(clientId: number, round: number): { started: number; skipped: string[] } {
  const plan = getPlan(clientId);
  const r = plan?.data?.rounds.find((x) => x.round === round);
  if (!plan || !r) throw new Error("That round isn't in the plan.");
  const open = new Set(getItems(clientId).filter((i) => i.status !== "deleted" && i.status !== "updated").map((i) => i.id));
  let started = 0;
  const skipped: string[] = [];
  for (const a of r.actions) {
    const ids = a.item_ids.filter((id) => open.has(id));
    if (!ids.length) {
      skipped.push(`${a.letter_type.replace(/_/g, " ")}: its items are no longer open`);
      continue;
    }
    try {
      started += createLetters(clientId, a.letter_type, ids, a.bureaus).length;
    } catch (e) {
      skipped.push(`${a.letter_type.replace(/_/g, " ")}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  run("UPDATE plans SET drafted_rounds = ? WHERE client_id = ?", JSON.stringify([...new Set([...plan.drafted_rounds, round])]), clientId);
  return { started, skipped };
}

export function saveAnswers(clientId: number, answers: Record<string, string>) {
  const plan = getPlan(clientId);
  if (!plan?.data) throw new Error("There's no plan to answer yet.");
  const clean: Record<string, string> = {};
  plan.data.questions.forEach((_, n) => {
    const v = answers[String(n)];
    if (typeof v === "string" && v.trim()) clean[String(n)] = v.trim().slice(0, 1000);
  });
  run("UPDATE plans SET answers = ? WHERE client_id = ?", JSON.stringify({ ...plan.answers, ...clean }), clientId);
}

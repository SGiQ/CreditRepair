import { canMail, hasReplyClock, type ClientBundle, type Letter } from "./types";

export interface Step {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  /** Nothing for this person to do right now; the ball is in someone else's court. */
  waiting?: boolean;
  /** Optional step that was passed over; shown, but never the "current" step. */
  skipped?: boolean;
  /** Workspace tab (specialist) or page section (client) where the step is done. */
  target?: string;
  cta?: string;
}

const DAY = 86_400_000;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dueMs = (l: Letter) => new Date(`${l.delivered_at || l.sent_at}T12:00:00`).getTime() + 30 * DAY;

/** Dispute correspondence: everything except freeze requests, which have their own checklist. */
const disputes = (b: ClientBundle) => b.letters.filter((l) => l.type !== "freeze_request" && (l.status === "draft" || l.status === "sent"));
const toMail = (ls: Letter[]) => ls.filter((l) => l.status === "draft" && l.type !== "cfpb_complaint");
const awaiting = (ls: Letter[]) => ls.filter((l) => l.status === "sent" && !l.response && l.sent_at && hasReplyClock(l.type));
const cfpbToFile = (b: ClientBundle) => b.letters.filter((l) => l.type === "cfpb_complaint" && l.status === "draft");

export const currentStep = (steps: Step[]) => steps.findIndex((s) => !s.done && !s.skipped);

/** The full process for one client's file, from the specialist's side. */
export function adminSteps(b: ClientBundle): Step[] {
  const { client: c, reports, items, letters, freezes } = b;
  const first = c.name.split(" ")[0];
  const missing = [
    !c.address1 && "street address",
    (!c.city || !c.state || !c.zip) && "city, state and ZIP",
    !c.dob && "date of birth",
    !c.ssn_last4 && "last 4 of SSN",
  ].filter(Boolean);

  const analyzing = reports.some((r) => r.status === "analyzing");
  const analyzed = items.length > 0 || reports.some((r) => r.status === "done");
  const ds = disputes(b);
  const drafting = letters.some((l) => l.status === "generating");
  const drafts = toMail(ds);
  const approved = drafts.filter((l) => l.signed_at).length;
  const sent = ds.filter((l) => l.status === "sent");
  const waiting = awaiting(ds);
  const overdue = waiting.filter((l) => dueMs(l) < Date.now());
  const open = items.filter((i) => i.status !== "deleted" && i.status !== "updated");
  const verified = items.filter((i) => i.status === "verified").length;
  const frozen = freezes.some((f) => f.status !== "todo");

  return [
    {
      key: "details",
      title: "Complete the client's details",
      detail: missing.length
        ? `Still needed: ${missing.join(", ")}. These print on every letter, and the bureaus use them to find the file.`
        : "Name, mailing address, date of birth and last 4 of SSN are on file.",
      done: !missing.length,
      target: "Overview",
      cta: "Edit client details",
    },
    {
      key: "report",
      title: "Upload their credit report",
      detail: analyzing
        ? "The agent is reading the report now. This takes a few minutes."
        : `Upload a 3-bureau report, or invite ${first} to upload it from their own login. The agent finds every negative, inaccurate or unverified account.`,
      done: analyzed,
      waiting: analyzing,
      target: "Overview",
      cta: "Upload a report",
    },
    {
      key: "review",
      title: "Review the negative items",
      detail: `${plural(items.length, "item")} found. Open each one to check the dispute angle, add anything ${first} has told you in the notes, and remove any that should not be disputed.`,
      done: items.length > 0 && (ds.length > 0 || items.some((i) => i.status !== "identified")),
      target: "Negative items",
      cta: "Review items",
    },
    {
      key: "freeze",
      title: "Freeze the secondary bureaus",
      detail: "Request freezes at LexisNexis, Innovis, ChexSystems and the others, online or with a mail-in letter. Optional, but best done before disputes go out.",
      done: frozen,
      skipped: !frozen && sent.length > 0,
      target: "Freezes",
      cta: "Open freeze checklist",
    },
    {
      key: "draft",
      title: "Draft the dispute letters",
      detail: drafting
        ? "The agent is writing the letters now."
        : "Pick a letter type and the items, then all three bureaus or one at a time. Start with round-one bureau disputes and debt validation for collections.",
      done: ds.length > 0,
      waiting: drafting,
      target: "Letters",
      cta: "Draft letters",
    },
    {
      key: "mail",
      title: "Get the letters signed and mailed",
      detail: !drafts.length
        ? "Every drafted letter has been mailed."
        : b.mail.enabled
          ? `${plural(drafts.length, "letter")} ready, ${approved} approved by ${first}. Review each one; once ${first} approves and signs it in their login, press "Send certified mail". Or download it for them to print and mail, and mark it as sent.`
          : `${plural(drafts.length, "letter")} ready. Review each one, then download it for ${first} to sign and mail by certified mail (or they can download it from their login). Mark each as sent to start its 30-day clock.`,
      done: ds.length > 0 && !drafts.length && sent.length > 0,
      target: "Letters",
      cta: "Review and send letters",
    },
    {
      key: "outcome",
      title: "Record the replies",
      detail: overdue.length
        ? `${plural(overdue.length, "letter")} past the 30-day deadline. Record "No response" on each, then draft a no-response follow-up.`
        : waiting.length
          ? `Waiting on ${plural(waiting.length, "reply", "replies")}; the earliest is due ${fmt(Math.min(...waiting.map(dueMs)))}. When one arrives, record the outcome on the letter and update each item's status.`
          : "Every sent letter has an outcome recorded.",
      done: sent.length > 0 && !waiting.length,
      waiting: waiting.length > 0 && !overdue.length,
      target: "Letters",
      cta: overdue.length ? "Record outcomes" : undefined,
    },
    {
      key: "followup",
      title: "Follow up until every item is resolved",
      detail: !open.length
        ? "Every tracked item has been deleted or corrected."
        : cfpbToFile(b).length
          ? `${plural(cfpbToFile(b).length, "CFPB complaint narrative is", "CFPB complaint narratives are")} ready. ${first} files each one online at consumerfinance.gov/complaint (the app cannot file it); it is in their login with instructions. Mark it filed once they confirm.`
        : verified
          ? `${plural(verified, "item")} came back verified. Draft a method-of-verification demand, and escalate to a final notice or CFPB complaint if that fails. Ask ${first} for a fresh report to confirm changes.`
          : `${plural(open.length, "item")} still open. Draft the next round for anything unresolved, and ask ${first} for a fresh report to confirm what changed.`,
      done: items.length > 0 && !open.length,
      target: "Letters",
      cta: "Draft follow-ups",
    },
  ];
}

/** The same process as the client experiences it. */
export function clientSteps(b: ClientBundle): Step[] {
  const { reports, items } = b;
  const ds = disputes(b);
  const drafts = toMail(ds);
  const sent = ds.filter((l) => l.status === "sent");
  const waiting = awaiting(ds);
  const unapproved = drafts.filter((l) => canMail(l.type) && !l.signed_at);
  const analyzing = reports.some((r) => r.status === "analyzing");
  const uploaded = reports.some((r) => r.status !== "error");
  const analyzed = items.length > 0 || reports.some((r) => r.status === "done");
  const answered = sent.length > 0 && !waiting.length;
  // A report uploaded after the latest mailing is the "what changed" check.
  const lastSent = sent.map((l) => l.sent_at).sort().pop() ?? "";
  const freshReport = Boolean(lastSent) && reports.some((r) => r.status !== "error" && r.uploaded_at.slice(0, 10) > lastSent);

  return [
    {
      key: "upload",
      title: "Upload your credit report",
      detail: "Get your free reports at annualcreditreport.com (or from your credit monitoring app), save them as a PDF, and upload the file below.",
      done: uploaded,
      target: "reports",
      cta: "Upload report",
    },
    {
      key: "review",
      title: "We review your report",
      detail: analyzing
        ? "Your report is being read right now. This takes a few minutes."
        : "Every account is checked for errors, and the ones that can be challenged are listed under Accounts we're working on.",
      done: analyzed,
      waiting: true,
    },
    {
      key: "prepare",
      title: "Your letters are prepared",
      detail: "Your specialist writes a letter for each bureau or creditor. They will appear under Your letters. Nothing for you to do yet.",
      done: ds.length > 0,
      waiting: true,
    },
    {
      key: "mail",
      title: b.mail.enabled ? "Approve your letters" : "Print, sign and mail your letters",
      detail: !drafts.length
        ? "All of your letters have been mailed."
        : !b.mail.enabled
          ? `${plural(drafts.length, "letter is", "letters are")} ready. Download and print each one, sign it, add the enclosures it lists, and send it by certified mail. Then press "I mailed this" so the 30-day clock starts.`
          : unapproved.length
            ? `${plural(unapproved.length, "letter needs", "letters need")} your approval. ${b.signature.onFile ? "" : "Save your signature first, then "}read each one and press "Approve & sign" so your specialist can send it by certified mail. You can also print and mail it yourself, then press "I mailed this".`
            : "You've approved everything. Your specialist is sending your letters by certified mail.",
      done: ds.length > 0 && !drafts.length && sent.length > 0,
      waiting: b.mail.enabled && drafts.length > 0 && !unapproved.length,
      target: b.mail.enabled && !b.signature.onFile ? "signature" : "letters",
      cta: b.mail.enabled && !b.signature.onFile ? "Add your signature" : "Go to your letters",
    },
    // Only appears once the specialist has escalated and written a complaint for them to file.
    ...(b.letters.some((l) => l.type === "cfpb_complaint")
      ? [
          {
            key: "cfpb",
            title: "File your CFPB complaint",
            detail:
              "Your specialist has written a complaint for you. Only you can file it: download it, open consumerfinance.gov/complaint, choose \"Credit reporting\", and paste the text into the \"What happened\" box. Then press \"I filed this\". The company usually has 15 days to respond.",
            done: !cfpbToFile(b).length,
            target: "letters",
            cta: "Go to your complaint",
          },
        ]
      : []),
    {
      key: "wait",
      title: "Wait for the replies",
      detail: waiting.some((l) => dueMs(l) < Date.now())
        ? "At least one reply is past its 30-day deadline. If anything has arrived in the mail, tell your specialist what it says; if not, they will send a follow-up."
        : waiting.length
        ? `The bureaus have 30 days to answer; the first reply is due around ${fmt(Math.min(...waiting.map(dueMs)))}. Keep every piece of mail you receive and let your specialist know what it says.`
        : "Bureaus and creditors have 30 days to answer. Keep every piece of mail you receive.",
      done: answered,
      waiting: true,
    },
    {
      key: "refresh",
      title: "Upload a fresh report",
      detail: "Once replies arrive, pull a new credit report and upload it so we can confirm what was deleted or corrected and plan the next round.",
      done: freshReport && answered,
      target: "reports",
      cta: "Upload new report",
    },
  ];
}

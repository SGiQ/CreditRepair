// Creates (or removes) a fictional demo client with a full sample file, plus demo logins.
//
//   npm run demo          create / reset the demo data
//   npm run demo:remove   delete it
//
// Everything here is made up: the person, the creditors, the account numbers.
// The demo logins use the well-known credentials below, so this refuses to run
// in production. Remove the demo before putting the app in front of real clients.
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";

export const DEMO = {
  specialist: { email: "demo.specialist@example.com", password: "demo-specialist-2026" },
  client: { email: "demo.client@example.com", password: "demo-client-2026" },
};

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to create demo logins in production.");
  process.exit(1);
}

const db = new DatabaseSync(path.join(process.cwd(), "data", "credit-repair.db"));
db.exec("PRAGMA foreign_keys = ON");
try {
  db.prepare("SELECT 1 FROM users LIMIT 1").get();
} catch {
  console.error("Database not set up yet. Start the app once (npm run dev), open it in the browser, then run this again.");
  process.exit(1);
}

// Same format as src/lib/auth.ts.
const hashPassword = (pw) => {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`;
};
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const J = JSON.stringify;

function remove() {
  db.prepare("DELETE FROM clients WHERE email = ?").run(DEMO.client.email);
  db.prepare("DELETE FROM users WHERE email IN (?, ?)").run(DEMO.specialist.email, DEMO.client.email);
}

remove();
if (process.argv.includes("--remove")) {
  console.log("Demo data and demo logins removed.");
  process.exit(0);
}

const clientId = Number(
  db
    .prepare(
      `INSERT INTO clients (name, address1, address2, city, state, zip, dob, ssn_last4, phone, email)
       VALUES ('Jordan Demo', '4821 Sample Creek Drive', 'Apt 12', 'Atlanta', 'GA', '30301', '04/15/1988', '0000', '(555) 010-0142', ?)`,
    )
    .run(DEMO.client.email).lastInsertRowid,
);

const reportId = Number(
  db
    .prepare("INSERT INTO reports (client_id, filename, stored_path, status, summary, uploaded_at) VALUES (?, ?, '', 'done', ?, datetime('now', '-48 days'))")
    .run(
      clientId,
      "Jordan-Demo-3-bureau-report.pdf",
      "Seven items worth acting on: two collections, a charge-off, a late-payment tradeline, a repossession balance, an unrecognized hard inquiry, and a stale address. The strongest disputes are the Northgate collection (balances and dates differ across bureaus) and the Pinnacle medical collection (no original-creditor detail). Start with debt validation on both collections and a round-one bureau dispute, then work the Summit charge-off balance. The Lakeshore late payment appears accurate; a goodwill request is the realistic route.",
    ).lastInsertRowid,
);

const FCRA611 = { citation: "FCRA §611 (15 U.S.C. §1681i)", why: "The bureau must reinvestigate within 30 days and delete what it cannot verify." };
const insertItem = db.prepare(
  `INSERT INTO items (client_id, report_id, creditor, creditor_address, original_creditor, account_number, category, bureaus, balance,
     date_opened, date_of_first_delinquency, reported_status, issues, laws, dispute_angle, next_steps, strength, status, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const item = (i) =>
  Number(
    insertItem.run(
      clientId, reportId, i.creditor, i.address ?? "", i.original ?? "", i.acct ?? "", i.category, J(i.bureaus), i.balance ?? "",
      i.opened ?? "", i.dofd ?? "", i.reported, J(i.issues), J(i.laws), i.angle, J(i.steps), i.strength, i.status, i.notes ?? "",
    ).lastInsertRowid,
  );

const northgate = item({
  creditor: "Northgate Recovery Services",
  address: "P.O. Box 1180\nSample City, OH 43004",
  original: "Summit Retail Card",
  acct: "NRS-4471****",
  category: "collection",
  bureaus: ["Equifax", "Experian", "TransUnion"],
  balance: "$1,862",
  opened: "08/2023",
  dofd: "11/2021",
  reported: "Collection account, $1,862 past due",
  issues: [
    "Balance differs across bureaus: Equifax $1,862, Experian $1,790, TransUnion $1,862.",
    "Date of first delinquency reads 11/2021 on Equifax and 03/2022 on TransUnion — possible re-aging.",
    "Experian lists no original creditor.",
  ],
  laws: [
    FCRA611,
    { citation: "FCRA §605(c) (15 U.S.C. §1681c(c))", why: "The 7-year period runs from the original delinquency date; a later date extends reporting unlawfully." },
    { citation: "FDCPA §809 (15 U.S.C. §1692g)", why: "The collector must validate the debt on written request." },
  ],
  angle: "The three bureaus disagree on both the balance and the date of first delinquency, so the tradeline cannot be accurate everywhere it appears. Demand validation from the collector and reinvestigation from each bureau, pointing to the specific mismatches.",
  steps: [
    "Send a debt validation letter to Northgate by certified mail.",
    "Dispute with all three bureaus, citing the balance and date conflicts.",
    "If verified, send a method-of-verification demand.",
    "If the later delinquency date stays, escalate to the CFPB as re-aging.",
  ],
  strength: "strong",
  status: "awaiting_response",
});

const pinnacle = item({
  creditor: "Pinnacle Medical Collections",
  address: "200 Example Parkway, Suite 40\nSampleton, TN 37011",
  acct: "PMC-90****",
  category: "collection",
  bureaus: ["Equifax", "TransUnion"],
  balance: "$412",
  opened: "02/2024",
  reported: "Medical collection, $412",
  issues: ["No original creditor or provider named.", "No date of first delinquency on either bureau.", "Balance is under $500."],
  laws: [
    FCRA611,
    { citation: "FCRA §623(a)(5) (15 U.S.C. §1681s-2(a)(5))", why: "A furnisher reporting a collection must report the date of delinquency." },
    { citation: "FDCPA §809 (15 U.S.C. §1692g)", why: "Validation must identify the original creditor." },
  ],
  angle: "The entry is incomplete: no provider and no delinquency date. The bureaus' own medical-debt policy also excludes collections under $500, so this should not be reporting at all.",
  steps: ["Dispute with Equifax and TransUnion as incomplete and under the $500 threshold.", "Send debt validation to Pinnacle."],
  strength: "strong",
  status: "deleted",
  notes: "Deleted from both bureaus after round one.",
});

const summit = item({
  creditor: "Summit Bank Card",
  address: "P.O. Box 5500\nExampleville, DE 19801",
  acct: "5412-88**-****-****",
  category: "charge_off",
  bureaus: ["Equifax", "Experian", "TransUnion"],
  balance: "$1,790",
  opened: "06/2018",
  dofd: "11/2021",
  reported: "Charged off, $1,790 balance, sold to another lender",
  issues: [
    "Still reports a $1,790 balance although the account is marked sold/transferred.",
    "Same debt also appears as the Northgate collection — the balance is counted twice.",
  ],
  laws: [
    FCRA611,
    { citation: "FCRA §623(a)(2) (15 U.S.C. §1681s-2(a)(2))", why: "A furnisher must update information it knows is no longer accurate — a sold account should show a zero balance." },
  ],
  angle: "Once a debt is sold, the original creditor no longer has a balance to report. Summit and Northgate both reporting a balance for the same debt doubles the apparent amount owed.",
  steps: ["Dispute the balance with all three bureaus.", "Send a direct dispute to Summit asking for a $0 balance.", "If verified, demand the method of verification."],
  strength: "moderate",
  status: "verified",
  notes: "Equifax came back verified. Experian and TransUnion still open.",
});

const lakeshore = item({
  creditor: "Lakeshore Auto Finance",
  acct: "LAF-2209****",
  category: "late_payment",
  bureaus: ["Equifax", "Experian", "TransUnion"],
  balance: "$8,340",
  opened: "03/2021",
  reported: "Open, current. 30 days late 07/2024",
  issues: ["Single 30-day late reported consistently by all three bureaus."],
  laws: [{ citation: "FCRA §623(a)(8) (15 U.S.C. §1681s-2(a)(8))", why: "The client may dispute directly with the furnisher, though the entry appears accurate." }],
  angle: "This looks accurate and consistent, so a dispute is unlikely to succeed. A goodwill request to Lakeshore, pointing to the otherwise clean history, is the realistic option.",
  steps: ["Send a goodwill adjustment request to Lakeshore.", "Otherwise the late mark ages off 07/2031."],
  strength: "weak",
  status: "identified",
  notes: "Client was in hospital that month — mention in goodwill letter.",
});

const repo = item({
  creditor: "First Example Credit Union",
  address: "75 Placeholder Road\nSample City, GA 30002",
  acct: "FECU-71****",
  category: "repossession",
  bureaus: ["Experian", "TransUnion"],
  balance: "$3,125",
  opened: "09/2019",
  dofd: "05/2022",
  reported: "Repossession, deficiency balance $3,125",
  issues: ["Experian shows the deficiency as $3,125; TransUnion shows $3,480.", "No sale date or sale proceeds reflected."],
  laws: [
    FCRA611,
    { citation: "UCC §9-611 to §9-616 (state law)", why: "The lender must send notice of sale and an explanation of how the deficiency was calculated." },
  ],
  angle: "The two bureaus report different deficiency balances, and there is no sign the sale proceeds were credited. Ask for the deficiency calculation and dispute the inconsistent balance.",
  steps: ["Dispute the balance with Experian and TransUnion.", "Send a direct dispute to the credit union requesting the deficiency calculation."],
  strength: "moderate",
  status: "disputed",
});

const inquiry = item({
  creditor: "Metro Motors Credit",
  category: "inquiry",
  bureaus: ["Experian"],
  reported: "Hard inquiry 02/2025",
  issues: ["Client does not recall applying for credit with this company."],
  laws: [{ citation: "FCRA §604 (15 U.S.C. §1681b)", why: "A report may only be pulled for a permissible purpose." }],
  angle: "Ask Experian to confirm the permissible purpose for the inquiry and remove it if the company cannot substantiate one.",
  steps: ["Send an inquiry challenge to Experian.", "Ask the client to check whether they shopped for a car in early 2025."],
  strength: "moderate",
  status: "identified",
});

item({
  creditor: "Former address — 19 Old Sample Lane",
  category: "personal_info",
  bureaus: ["Equifax", "TransUnion"],
  reported: "Previous address listed as current on Equifax",
  issues: ["Equifax lists an address the client left in 2019 as current.", "TransUnion shows a misspelled name variation, 'Jordon Demo'."],
  laws: [{ citation: "FCRA §607(b) (15 U.S.C. §1681e(b))", why: "Bureaus must follow reasonable procedures to assure maximum possible accuracy." }],
  angle: "Clean up the identifying information first: stale addresses and name variants are what old accounts get matched against.",
  steps: ["Send a personal-information correction to Equifax and TransUnion with proof of current address."],
  strength: "strong",
  status: "updated",
});

const insertLetter = db.prepare(
  `INSERT INTO letters (client_id, item_ids, type, round, recipient_name, recipient_address, subject, body, enclosures, status, sent_at, response, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`,
);
const letter = (l) =>
  insertLetter.run(
    clientId, J(l.items), l.type, l.round ?? 1, l.to, l.address ?? "", l.subject, l.body, J(l.enclosures ?? []),
    l.sent ? "sent" : "draft", l.sent ? daysAgo(l.sent) : "", l.response ?? "", `-${l.sent ?? 1} days`,
  );
const ID_DOCS = ["Copy of driver's license", "Copy of a recent utility bill", "Copy of the report page with the items circled"];
const BUREAU = {
  Equifax: ["Equifax Information Services LLC", "P.O. Box 740256\nAtlanta, GA 30374-0256"],
  Experian: ["Experian", "P.O. Box 4500\nAllen, TX 75013"],
  TransUnion: ["TransUnion Consumer Solutions", "P.O. Box 2000\nChester, PA 19016-2000"],
};

const round1 = (bureau, lines) => `To Whom It May Concern:

I am writing to dispute information in my ${bureau} credit file that is inaccurate or incomplete. I have reviewed my report and compared it with the reports issued by the other two national bureaus, and the following accounts are not being reported correctly:

${lines.join("\n")}

Under the Fair Credit Reporting Act, 15 U.S.C. §1681i, you are required to conduct a reasonable reinvestigation of these items within 30 days and to delete or correct any information that is inaccurate, incomplete, or cannot be verified. Because the furnishers are reporting different facts to different bureaus, the information cannot be accurate as it stands.

Please send me written results of your reinvestigation and an updated copy of my report at the address above.`;

const northLine = "- Northgate Recovery Services, account NRS-4471**** — the balance and the date of first delinquency do not match what is reported to the other bureaus. The delinquency date appears to have been moved forward.";
const summitLine = "- Summit Bank Card, account 5412-88**-****-**** — reported as sold to another lender yet still showing a $1,790 balance. The same debt is also reported by Northgate Recovery Services.";

letter({
  type: "bureau_dispute", items: [northgate, summit, pinnacle], to: BUREAU.Equifax[0], address: BUREAU.Equifax[1], sent: 41, response: "verified",
  subject: "Dispute of inaccurate information — request for reinvestigation",
  body: round1("Equifax", [northLine, summitLine, "- Pinnacle Medical Collections, account PMC-90**** — no original creditor and no date of first delinquency are reported."]),
  enclosures: ID_DOCS,
});
letter({
  type: "bureau_dispute", items: [northgate, summit], to: BUREAU.Experian[0], address: BUREAU.Experian[1], sent: 34,
  subject: "Dispute of inaccurate information — request for reinvestigation",
  body: round1("Experian", [northLine.replace("the balance and the date", "the balance ($1,790 here, $1,862 elsewhere) and the date"), summitLine]),
  enclosures: ID_DOCS,
});
letter({
  type: "bureau_dispute", items: [northgate, summit, pinnacle], to: BUREAU.TransUnion[0], address: BUREAU.TransUnion[1], sent: 12,
  subject: "Dispute of inaccurate information — request for reinvestigation",
  body: round1("TransUnion", [northLine, summitLine, "- Pinnacle Medical Collections, account PMC-90**** — no original creditor and no date of first delinquency are reported."]),
  enclosures: ID_DOCS,
});
letter({
  type: "debt_validation", items: [northgate], to: "Northgate Recovery Services", address: "P.O. Box 1180\nSample City, OH 43004", sent: 41,
  subject: "Request for validation of debt — account NRS-4471****",
  body: `To Whom It May Concern:

Your company is reporting a collection account in my name to the credit bureaus. I dispute this debt and request validation under the Fair Debt Collection Practices Act, 15 U.S.C. §1692g. This letter is not an acknowledgment that I owe any amount.

Please provide:

- The amount you claim is owed, with an itemization of principal, interest, and fees.
- The name and address of the original creditor and the original account number.
- Documentation showing that your company owns this debt or is authorized to collect it.
- The date of first delinquency you have on record.

The balance and delinquency date you report differ between the credit bureaus. Until this debt is validated, please report it as disputed, as required by 15 U.S.C. §1692e(8).`,
});
letter({
  type: "method_of_verification", round: 2, items: [summit, northgate], to: BUREAU.Equifax[0], address: BUREAU.Equifax[1],
  subject: "Request for method of verification — dispute results dated " + daysAgo(9),
  body: `To Whom It May Concern:

I disputed the accounts below by letter mailed ${daysAgo(41)}. Your response states that they were verified, without explaining how.

- Summit Bank Card, account 5412-88**-****-****
- Northgate Recovery Services, account NRS-4471****

Under 15 U.S.C. §1681i(a)(6)(B)(iii) and §1681i(a)(7), I request a description of the procedure used to determine the accuracy of each account, including the business name, address, and telephone number of every furnisher you contacted. Please provide this within 15 days.

The inaccuracies I identified remain: a sold account cannot carry a balance, and the Northgate delinquency date still differs from what is reported elsewhere. If these accounts cannot be verified with documentation, they must be deleted under §1681i(a)(5)(A).`,
  enclosures: ["Copy of your dispute results", "Copy of my original dispute letter"],
});
letter({
  type: "furnisher_dispute", items: [repo], to: "First Example Credit Union", address: "75 Placeholder Road\nSample City, GA 30002",
  subject: "Direct dispute of account FECU-71****",
  body: `To Whom It May Concern:

I am disputing the information you furnish to the credit bureaus about the account above, under 15 U.S.C. §1681s-2(a)(8) and 12 C.F.R. §1022.43.

You are reporting a deficiency balance of $3,125 to Experian and $3,480 to TransUnion. Both cannot be correct. Neither entry reflects the date the vehicle was sold or the amount the sale produced.

Please investigate, send me the written explanation of how the deficiency was calculated, and correct the balance with every bureau you report to.`,
});
letter({
  type: "freeze_request", items: [], to: "LexisNexis Risk Solutions Consumer Center", address: "Attn: Security Freeze\nP.O. Box 105108\nAtlanta, GA 30348-5108", sent: 45,
  subject: "Request for Security Freeze",
  body: `To Whom It May Concern:

I am writing to request that a security freeze be placed on my consumer file, as is my right under the Fair Credit Reporting Act, 15 U.S.C. §1681c-1(i).

My identifying information appears above. I have enclosed copies of documents verifying my identity and current address.

Please send written confirmation that the freeze has been placed, along with the PIN or instructions I will need to lift it in the future.`,
  enclosures: ["Copy of government-issued photo ID", "Proof of current address"],
});

// Score history: a reading from the analyzed report, then monthly checks from a monitoring app.
const score = db.prepare("INSERT INTO scores (client_id, report_id, bureau, score, model, as_of, source) VALUES (?, ?, ?, ?, ?, ?, ?)");
const HISTORY = { Equifax: [548, 561, 579, 602], Experian: [552, 558, 571, 594], TransUnion: [541, 556, 580, 611] };
for (const [bureau, values] of Object.entries(HISTORY)) {
  values.forEach((v, i) => {
    const fromReport = i === 0;
    score.run(clientId, fromReport ? reportId : null, bureau, v, fromReport ? "VantageScore 3.0" : "VantageScore 3.0", daysAgo(48 - i * 16), fromReport ? "report" : "manual");
  });
}

// A mailing fee so the pay-or-mail-yourself choice shows in the portal.
db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
db.prepare("INSERT INTO settings (key, value) VALUES ('mail_fee_cents', '1000') ON CONFLICT (key) DO NOTHING").run();

const freeze = db.prepare("INSERT INTO freezes (client_id, agency, status) VALUES (?, ?, ?)");
for (const [agency, status] of [["lexisnexis", "frozen"], ["innovis", "frozen"], ["chexsystems", "requested"], ["corelogic", "requested"]]) {
  freeze.run(clientId, agency, status);
}

db.prepare("INSERT INTO users (email, password_hash, role, client_id) VALUES (?, ?, 'client', ?)").run(
  DEMO.client.email, hashPassword(DEMO.client.password), clientId,
);
const lines = [`Demo client "Jordan Demo" created.`, "", `  Client portal login:  ${DEMO.client.email}  /  ${DEMO.client.password}`];
// Only add a demo specialist when nobody has set the app up yet; never alongside a real one.
if (!db.prepare("SELECT 1 FROM users WHERE role = 'admin'").get()) {
  db.prepare("INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'admin')").run(DEMO.specialist.email, hashPassword(DEMO.specialist.password));
  lines.push(`  Specialist login:     ${DEMO.specialist.email}  /  ${DEMO.specialist.password}`);
} else {
  lines.push("  Specialist: sign in with your own account — Jordan Demo is in your client list.");
}
console.log([...lines, "", "Remove everything with: npm run demo:remove"].join("\n"));

// Emergency recovery when every admin is locked out: prints a one-time password-reset path.
//   npm run reset-link -- you@example.com
// Open http(s)://<your-host><printed path> within 60 minutes.
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run reset-link -- <email>");
  process.exit(1);
}
const db = new DatabaseSync(path.join(process.cwd(), "data", "credit-repair.db"));
const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (!user) {
  console.error("No account with that email.");
  process.exit(1);
}
const token = randomBytes(32).toString("base64url");
db.prepare("DELETE FROM password_resets WHERE user_id = ?").run(user.id);
db.prepare("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+60 minutes'))").run(
  createHash("sha256").update(token).digest("hex"),
  user.id,
);
console.log(`Reset path (valid 60 minutes, single use):\n  /reset/${token}`);

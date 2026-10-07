/**
 * Background work that must keep running without anyone loading a page:
 * checking certified-mail tracking so delivery emails go out on time.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __crPoller?: ReturnType<typeof setInterval> };
  // SQLite lives on the local disk, so this process is the only one that can take the backup.
  if (g.__crPoller) return;
  const { mailConfig, pollAllTracking } = await import("./lib/mail");
  const tick = () => pollAllTracking().catch((e) => console.error("tracking poller", e));
  // Lob updates tracking a few times a day; the demo "delivers" within two minutes.
  const every = mailConfig().mode === "demo" ? 20_000 : 30 * 60_000;
  g.__crPoller = setInterval(tick, every);
  g.__crPoller.unref?.();
  setTimeout(tick, 5_000).unref?.();

  // Nightly backup: checked hourly, runs once per day after BACKUP_HOUR (default 3 a.m. server time).
  const { nightlyTick } = await import("./lib/backup");
  const nightly = () => nightlyTick().catch((e) => console.error("nightly backup", e));
  setInterval(nightly, 60 * 60_000).unref?.();
  setTimeout(nightly, 60_000).unref?.();

  // Monthly "upload a fresh report" emails to clients: checked hourly, each client at most once per interval.
  const { reminderTick } = await import("./lib/reminders");
  const remind = () => reminderTick().catch((e) => console.error("report reminders", e));
  setInterval(remind, 60 * 60_000).unref?.();
  setTimeout(remind, 90_000).unref?.();
}

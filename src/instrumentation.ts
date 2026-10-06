/**
 * Background work that must keep running without anyone loading a page:
 * checking certified-mail tracking so delivery emails go out on time.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __crPoller?: ReturnType<typeof setInterval> };
  if (g.__crPoller) return;
  const { mailConfig, pollAllTracking } = await import("./lib/mail");
  const tick = () => pollAllTracking().catch((e) => console.error("tracking poller", e));
  // Lob updates tracking a few times a day; the demo "delivers" within two minutes.
  const every = mailConfig().mode === "demo" ? 20_000 : 30 * 60_000;
  g.__crPoller = setInterval(tick, every);
  g.__crPoller.unref?.();
  setTimeout(tick, 5_000).unref?.();
}

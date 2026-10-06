"use client";
import { useEffect, useRef, useState } from "react";
import type { TabProps } from "./ClientWorkspace";
import { Button, Card, inputClass } from "./ui";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "Which items should we dispute first, and why?",
  "What's our escalation plan if the bureaus verify everything?",
  "Which of these debts may be past the statute of limitations?",
];

export function AdvisorTab({ bundle }: TabProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const setReply = (content: string) => setMessages([...history, { role: "assistant", content }]);
    try {
      const res = await fetch(`/api/clients/${bundle.client.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += dec.decode(value, { stream: true });
        setReply(reply);
      }
    } catch (e) {
      setReply(`Something went wrong: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <Card className="flex h-[65vh] min-h-96 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {!messages.length && (
          <div className="mx-auto max-w-lg pt-8 text-center">
            <p className="font-medium">Ask the consumer-law advisor</p>
            <p className="mt-1 text-sm text-stone-600">
              It already knows {bundle.client.name}&apos;s {bundle.items.length} tracked items and letter history.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:border-emerald-600 hover:bg-emerald-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, n) => (
          <div key={n} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-800"
              }`}
            >
              {m.content || <span className="text-stone-400">Thinking…</span>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t border-stone-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          className={inputClass}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this client's file…"
          aria-label="Message the advisor"
        />
        <Button variant="primary" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </Card>
  );
}

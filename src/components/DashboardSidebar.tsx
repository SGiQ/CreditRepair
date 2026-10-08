"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { KeyDate, Step } from "@/lib/steps";
import { ProgressSidebar } from "./ProgressSidebar";
import { api } from "./ui";

interface Data {
  setup: Step[];
  key_dates: KeyDate[];
  attention: { client_id: number; client: string; text: string; tone: "red" | "amber" | "stone" }[];
}

const DOT = { red: "bg-red-600", amber: "bg-amber-500", stone: "bg-stone-400" };

/** Dashboard version of the sidebar: business setup checklist, key numbers, and today's top priorities. */
export function DashboardSidebar() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    api<Data>("/api/dashboard").then(setD).catch(() => {});
  }, []);
  if (!d) return <aside className="order-first h-40 animate-pulse rounded-xl border border-stone-200 bg-white lg:order-none" aria-hidden />;

  const top = d.attention.slice(0, 3);
  return (
    <ProgressSidebar
      title="Your setup"
      steps={d.setup}
      dates={d.key_dates}
      onAction={(step) => {
        if (!step.target) return;
        if (step.target.startsWith("#")) document.getElementById(step.target.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
        else router.push(step.target);
      }}
      doneLabel={
        top.length ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Setup complete · Next up</p>
            <Link href={`/clients/${top[0].client_id}`} className="mt-1 block font-semibold text-stone-900 hover:underline">
              {top[0].client}
            </Link>
            <p className="mt-0.5 text-stone-700">{top[0].text}</p>
          </>
        ) : (
          "Setup is complete and nothing is waiting on you. 🎉"
        )
      }
    >
      {top.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Today&apos;s priorities</p>
          <ul className="mt-2 space-y-2">
            {top.map((a, n) => (
              <li key={n}>
                <Link href={`/clients/${a.client_id}`} className="flex gap-2 rounded-md p-1 text-sm hover:bg-stone-50">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.tone]}`} aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium">{a.client}</span>
                    <span className="block text-xs leading-snug text-stone-600">{a.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {d.attention.length > 3 && <p className="mt-1 text-xs text-stone-500">+ {d.attention.length - 3} more under Needs attention</p>}
        </div>
      )}
    </ProgressSidebar>
  );
}

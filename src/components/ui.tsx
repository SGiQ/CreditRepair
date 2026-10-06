"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined
      ? { method: rest.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) }
      : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

const VARIANTS = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800 border-transparent",
  secondary: "bg-white text-stone-800 hover:bg-stone-50 border-stone-300",
  ghost: "bg-transparent text-stone-600 hover:bg-stone-100 border-transparent",
  danger: "bg-white text-red-700 hover:bg-red-50 border-red-200",
};

export function Button({
  variant = "secondary",
  small,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; small?: boolean }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"
      } ${VARIANTS[variant]} ${className}`}
    />
  );
}

export const linkButton = (small = true) =>
  `inline-flex items-center justify-center rounded-md border border-stone-300 bg-white font-medium text-stone-800 hover:bg-stone-50 ${
    small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"
  }`;

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-xl border border-stone-200 bg-white ${className}`}>
      {children}
    </section>
  );
}

const TONES = {
  stone: "bg-stone-100 text-stone-700",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-sky-100 text-sky-800",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "stone", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export const inputClass =
  "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20";

export function Field({ label, className = "", ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={`block text-xs font-medium text-stone-600 ${className}`}>
      {label}
      <input {...props} className={`${inputClass} mt-1 font-normal text-stone-900`} />
    </label>
  );
}

export function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{children}</p>;
}

export const fmtDate = (iso: string) =>
  iso
    ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso.replace(" ", "T") + "Z").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

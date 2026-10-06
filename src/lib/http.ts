import { NextResponse } from "next/server";

export const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
export const ok = (data: unknown = { ok: true }) => NextResponse.json(data);
export const NO_KEY = "No Anthropic API key configured. Add ANTHROPIC_API_KEY to .env.local and restart the app.";
export type Ctx = { params: Promise<{ id: string }> };
export const idOf = async (ctx: Ctx) => Number((await ctx.params).id);

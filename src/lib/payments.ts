import { randomBytes } from "node:crypto";
import { getSetting } from "./db";
import type { PaymentsConfig } from "./types";

// The client pays the mailing fee to the specialist's PayPal account before a letter is sent
// through the mail service. PayPal's Orders API: create → client approves (button or QR) → capture.

export const FEE_KEY = "mail_fee_cents";

export function paymentsConfig(): PaymentsConfig {
  const feeCents = Math.max(0, Math.round(Number(getSetting(FEE_KEY, "0")) || 0));
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (id && secret) return { enabled: true, mode: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox", feeCents };
  if (process.env.PAYMENTS_PROVIDER === "demo") return { enabled: true, mode: "demo", feeCents };
  return { enabled: false, mode: "off", feeCents };
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export interface OrderInfo {
  id: string;
  approveUrl: string;
}
export interface OrderStatus {
  /** "paid" once captured; "approved" means the client finished PayPal but capture is still needed. */
  status: "created" | "approved" | "paid" | "other";
  cents: number;
}

export class PaymentError extends Error {}

interface Provider {
  create(args: { cents: number; description: string; reference: string; returnUrl: string; cancelUrl: string }): Promise<OrderInfo>;
  /** Captures an approved order; returns the up-to-date status either way. */
  settle(orderId: string): Promise<OrderStatus>;
}

// ------------------------------------------------------------------ PayPal

const base = () => (process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

async function token(): Promise<string> {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new PaymentError(res.status === 401 ? "PayPal rejected the client ID or secret." : `PayPal sign-in failed (${res.status}).`);
  return (await res.json()).access_token;
}

async function paypalCall(path: string, method: string, body?: unknown) {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new PaymentError(`PayPal error: ${json?.details?.[0]?.description ?? json?.message ?? res.status}`);
  return json;
}

const capturedCents = (order: { purchase_units?: { payments?: { captures?: { amount?: { value?: string } }[] } }[] }) =>
  Math.round(Number(order.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? 0) * 100);

const paypal: Provider = {
  async create(a) {
    const order = await paypalCall("/v2/checkout/orders", "POST", {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: a.reference,
          custom_id: a.reference,
          description: a.description.slice(0, 127),
          amount: { currency_code: "USD", value: (a.cents / 100).toFixed(2) },
        },
      ],
      application_context: {
        brand_name: "Credit Repair Desk",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: a.returnUrl,
        cancel_url: a.cancelUrl,
      },
    });
    const approve = (order.links as { rel: string; href: string }[]).find((l) => l.rel === "approve")?.href;
    if (!approve) throw new PaymentError("PayPal did not return an approval link.");
    return { id: order.id, approveUrl: approve };
  },
  async settle(id) {
    let order = await paypalCall(`/v2/checkout/orders/${encodeURIComponent(id)}`, "GET");
    if (order.status === "APPROVED") order = await paypalCall(`/v2/checkout/orders/${encodeURIComponent(id)}/capture`, "POST", {});
    if (order.status === "COMPLETED") return { status: "paid", cents: capturedCents(order) };
    if (order.status === "APPROVED") return { status: "approved", cents: 0 };
    return { status: order.status === "CREATED" || order.status === "PAYER_ACTION_REQUIRED" ? "created" : "other", cents: 0 };
  },
};

// ------------------------------------------------------------------ Demo

// No money moves: the "approval" page is inside the app and marks the order paid.
const demoOrders = ((globalThis as unknown as { __crDemoOrders?: Map<string, { cents: number; approved: boolean; returnUrl: string }> }).__crDemoOrders ??=
  new Map());

const demo: Provider = {
  async create(a) {
    const id = `DEMO-${randomBytes(6).toString("hex").toUpperCase()}`;
    demoOrders.set(id, { cents: a.cents, approved: false, returnUrl: a.returnUrl });
    return { id, approveUrl: `${new URL(a.returnUrl).origin}/pay/demo/${id}` };
  },
  async settle(id) {
    const o = demoOrders.get(id);
    if (!o) return { status: "other", cents: 0 };
    return o.approved ? { status: "paid", cents: o.cents } : { status: "created", cents: 0 };
  },
};

export function demoApprove(id: string): string | null {
  const o = demoOrders.get(id);
  if (!o) return null;
  o.approved = true;
  return o.returnUrl;
}

export function provider(): Provider {
  const { mode } = paymentsConfig();
  if (mode === "off") throw new PaymentError("Online payment isn't set up. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  return mode === "demo" ? demo : paypal;
}

"use client";
import { useState } from "react";
import { api, Button, Card, ErrorNote } from "./ui";

/** Stands in for PayPal's checkout page when PAYMENTS_PROVIDER=demo. */
export function DemoPay({ order }: { order: string }) {
  const [error, setError] = useState("");
  return (
    <Card className="mx-auto mt-10 w-full max-w-sm p-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Demo payment</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">This stands in for PayPal</h1>
      <p className="mt-2 text-sm text-stone-600">
        Order <span className="font-mono">{order}</span>. In real use, PayPal&apos;s checkout appears here. No money moves in demo mode.
      </p>
      <ErrorNote>{error}</ErrorNote>
      <Button
        variant="primary"
        className="mt-5 w-full"
        onClick={async () => {
          try {
            const { returnUrl } = await api<{ returnUrl: string }>(`/api/payments/demo/${order}`, { json: {} });
            window.location.href = returnUrl;
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Approve payment
      </Button>
    </Card>
  );
}

import Link from "next/link";
import { LeadForm } from "./LeadForm";

const STEPS = [
  {
    title: "Share your credit report",
    body: "Upload your reports from all three bureaus. Free copies are available at annualcreditreport.com.",
  },
  {
    title: "We review every account",
    body: "Each tradeline is checked for errors: balances and dates that don't match across bureaus, accounts reported past their time limit, duplicates, and missing information.",
  },
  {
    title: "You approve every letter",
    body: "We draft disputes citing the Fair Credit Reporting Act and the Fair Debt Collection Practices Act. Nothing is sent without your review and signature.",
  },
  {
    title: "Track it all online",
    body: "Your own secure login shows each item's status, reply deadlines, your letters, and your score history.",
  },
];

const FEATURES = [
  { title: "Your own client portal", body: "See exactly where your file stands, any time, from your phone or computer." },
  { title: "Bureau and creditor disputes", body: "Equifax, Experian and TransUnion, plus direct disputes and debt validation with collectors." },
  { title: "Deadlines watched for you", body: "Bureaus generally have 30 days to respond. We track every reply window and follow up when they miss it." },
  { title: "Secondary bureau freezes", body: "Guidance on freezing LexisNexis, Innovis, ChexSystems and others that lenders also check." },
  { title: "Score tracking", body: "Record your scores over time and see the change since you started." },
  { title: "Certified mail available", body: "Mail letters yourself, or have them sent by USPS Certified Mail with tracking." },
];

export function Landing() {
  return (
    <div className="space-y-20 pb-6">
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Credit report disputes, done carefully</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-5xl">
            Find what&apos;s wrong on your credit report, and challenge it.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
            We review your reports line by line, identify items that are inaccurate, incomplete or can&apos;t be verified, and
            dispute them under federal consumer law. You see every step, and approve every letter.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#contact" className="inline-flex items-center rounded-md bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800">
              Request a consultation
            </a>
            <Link href="/login" className="inline-flex items-center rounded-md border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-800 hover:bg-stone-50">
              Client sign in
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm" aria-hidden>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Your file</span>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">In progress</span>
          </div>
          <div className="mt-5 space-y-3">
            {[
              ["Collection account", "Balance differs across bureaus", "Disputed", "bg-sky-100 text-sky-800"],
              ["Late payment", "Date of delinquency missing", "Awaiting reply", "bg-amber-100 text-amber-800"],
              ["Old address", "Outdated personal information", "Corrected", "bg-emerald-100 text-emerald-800"],
            ].map(([t, d, s, c]) => (
              <div key={t} className="flex items-center justify-between gap-3 rounded-lg border border-stone-100 p-3">
                <div>
                  <div className="text-sm font-medium">{t}</div>
                  <div className="text-xs text-stone-500">{d}</div>
                </div>
                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{s}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-stone-400">Illustration of the client portal.</p>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, n) => (
            <li key={s.title} className="rounded-xl border border-stone-200 bg-white p-5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-700 text-sm font-semibold text-white">{n + 1}</span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">What&apos;s included</h2>
        <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight">What to expect, honestly</h2>
        <ul className="mt-4 grid gap-3 text-sm leading-relaxed text-stone-700 sm:grid-cols-2">
          <li>
            <strong>No one can guarantee results.</strong> The law lets you challenge information that is inaccurate, incomplete or
            unverifiable. Accurate, timely negative information can stay on your report for up to seven years.
          </li>
          <li>
            <strong>You can do this yourself for free.</strong> You have the right to dispute directly with the credit bureaus at no
            cost. We do the review, the drafting and the follow-up for you.
          </li>
          <li>
            <strong>It takes time.</strong> Each round of disputes usually takes 30 to 45 days, and many files need more than one
            round.
          </li>
          <li>
            <strong>Your information stays private.</strong> Reports and personal details are only used to work on your file, and
            only you and your specialist can see it.
          </li>
        </ul>
      </section>

      <section id="contact" className="grid scroll-mt-8 gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Talk to us about your credit</h2>
          <p className="mt-3 leading-relaxed text-stone-600">
            Tell us a little about your situation and we&apos;ll get back to you to talk through your options. Already a client?{" "}
            <Link href="/login" className="font-medium text-emerald-700 hover:underline">
              Sign in here
            </Link>
            .
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-6">
          <LeadForm />
        </div>
      </section>
    </div>
  );
}

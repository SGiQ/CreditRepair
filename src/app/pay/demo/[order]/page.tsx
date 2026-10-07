import { DemoPay } from "@/components/DemoPay";

export default async function DemoPayPage({ params }: { params: Promise<{ order: string }> }) {
  return <DemoPay order={(await params).order} />;
}

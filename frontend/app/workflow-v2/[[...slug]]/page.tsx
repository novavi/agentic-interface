import { NextGenWorkflow } from "@/components/NextGenWorkflow";

export default async function WorkflowV2Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const threadId = slug?.[0] ?? null;
  return <NextGenWorkflow threadId={threadId} />;
}

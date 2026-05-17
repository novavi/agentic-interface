import { Workflow } from "@/components/Workflow";

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const threadId = slug?.[0] ?? null;
  return <Workflow threadId={threadId} />;
}

import { Conversation } from "@/components/Conversation";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <Conversation threadId={threadId} />;
}

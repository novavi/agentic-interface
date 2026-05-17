export const STATUS_LABELS: Record<string, string> = {
  idle: "Idle",
  running: "Running…",
  complete: "Complete",
  error: "Error",
};

export function mapStatusLabel(status: string | undefined): string {
  if (!status) return "";
  return STATUS_LABELS[status] ?? status;
}

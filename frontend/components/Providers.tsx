"use client";

import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";
import { StockDataToolRenderer } from "./StockDataToolRenderer";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="agent"
      renderToolCalls={[StockDataToolRenderer]}
    >
      {children}
    </CopilotKit>
  );
}

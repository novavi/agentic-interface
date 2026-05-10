"use client";

import { CopilotKit } from "@copilotkit/react-core";
import "@copilotkit/react-ui/styles.css";
import { StockDataToolRenderer } from "./StockDataToolRenderer";
import { CompanyOverviewToolRenderer } from "./CompanyOverviewToolRenderer";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="agent"
      renderToolCalls={[StockDataToolRenderer, CompanyOverviewToolRenderer]}
    >
      {children}
    </CopilotKit>
  );
}

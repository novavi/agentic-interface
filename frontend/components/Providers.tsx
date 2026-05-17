"use client";

import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import "@copilotkit/react-core/v2/styles.css";
import { StockDataToolRenderer } from "./tool-renderers/StockDataToolRenderer";
import { CompanyOverviewToolRenderer } from "./tool-renderers/CompanyOverviewToolRenderer";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      useSingleEndpoint={true}
      showDevConsole={true}
      renderToolCalls={[StockDataToolRenderer, CompanyOverviewToolRenderer]}
    >
      {children}
    </CopilotKitProvider>
  );
}

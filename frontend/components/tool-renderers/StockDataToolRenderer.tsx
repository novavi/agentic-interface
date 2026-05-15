import { defineToolCallRenderer } from "@copilotkit/react-core/v2";
import { ToolCallStatus } from "@copilotkit/core";
import { z } from "zod";
import StockPriceChart from "./StockPriceChart";

const argsSchema = z.object({ company_name: z.string() });

type StockResult = {
  company: string;
  ticker: string;
  currency: string;
  data: { date: string; price: number }[];
  error?: string;
};

export const StockDataToolRenderer = defineToolCallRenderer({
  name: "get-stock-data",
  args: argsSchema,
  render: ({ status, result }) => {
    if (status === ToolCallStatus.Complete) {
      const parsed = JSON.parse(result) as StockResult;
      if (parsed.error) {
        return <p className="text-red-400 text-sm">{parsed.error}</p>;
      }
      return (
        <StockPriceChart
          company={parsed.company}
          ticker={parsed.ticker}
          data={parsed.data}
        />
      );
    }
    return (
      <p className="text-gray-400 text-sm animate-pulse">Loading chart…</p>
    );
  },
});

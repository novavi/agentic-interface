"use client";

import { useDefaultTool } from "@copilotkit/react-core";
import StockPriceChart from "./StockPriceChart";
import CompanyOverviewCard from "./CompanyOverviewCard";

type StockResult = {
  company: string;
  ticker: string;
  currency: string;
  data: { date: string; price: number }[];
  error?: string;
};

type OverviewResult = {
  company: string;
  ticker: string;
  overview: string;
  ceo: string;
  founded: string;
  headquarters: string;
  website: string;
  employees: string;
  error?: string;
};

export function ToolRenderer() {
  useDefaultTool({
    render: ({ name, result }) => {
      if (name === "get-stock-data") {
        if (!result) {
          return (
            <p className="text-gray-400 text-sm animate-pulse">
              Loading chart…
            </p>
          );
        }
        const parsed = result as unknown as StockResult;
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

      if (name === "get-company-overview") {
        if (!result) {
          return (
            <p className="text-gray-400 text-sm animate-pulse">
              Loading overview…
            </p>
          );
        }
        const parsed = result as unknown as OverviewResult;
        if (parsed.error) {
          return <p className="text-red-400 text-sm">{parsed.error}</p>;
        }
        return (
          <CompanyOverviewCard
            company={parsed.company}
            ticker={parsed.ticker}
            overview={parsed.overview}
            ceo={parsed.ceo}
            founded={parsed.founded}
            headquarters={parsed.headquarters}
            website={parsed.website}
            employees={parsed.employees}
          />
        );
      }

      return <></>;
    },
  });

  return null;
}

import { defineToolCallRenderer } from "@copilotkit/react-core/v2";
import { ToolCallStatus } from "@copilotkit/core";
import { z } from "zod";
import CompanyOverviewCard from "./CompanyOverviewCard";

const argsSchema = z.object({ company_name: z.string() });

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

export const CompanyOverviewToolRenderer = defineToolCallRenderer({
  name: "get-company-overview",
  args: argsSchema,
  render: ({ status, result }) => {
    if (status === ToolCallStatus.Complete) {
      const parsed = JSON.parse(result) as OverviewResult;
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
    return (
      <p className="text-gray-400 text-sm animate-pulse">Loading overview…</p>
    );
  },
});

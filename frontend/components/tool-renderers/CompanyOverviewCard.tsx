interface CompanyOverviewCardProps {
  company: string;
  ticker: string;
  overview: string;
  ceo: string;
  founded: string;
  headquarters: string;
  website: string;
  employees: string;
}

export default function CompanyOverviewCard({
  company,
  ticker,
  overview,
  ceo,
  founded,
  headquarters,
  website,
  employees,
}: CompanyOverviewCardProps) {
  return (
    <div className="rounded-lg bg-gray-900 p-4">
      <h3 className="text-gray-100 font-semibold mb-3">
        {company} ({ticker})
      </h3>
      <div className="grid grid-cols-[8rem_1fr] gap-x-6 gap-y-3 text-sm">
        <span className="text-gray-400 font-medium self-start">Overview</span>
        <span className="text-gray-100">{overview}</span>

        <span className="text-gray-400 font-medium self-start">CEO</span>
        <span className="text-gray-100">{ceo}</span>

        <span className="text-gray-400 font-medium self-start">Founded</span>
        <span className="text-gray-100">{founded}</span>

        <span className="text-gray-400 font-medium self-start">Headquarters</span>
        <span className="text-gray-100">{headquarters}</span>

        <span className="text-gray-400 font-medium self-start">Website</span>
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline self-start"
        >
          {new URL(website).hostname}
        </a>

        <span className="text-gray-400 font-medium self-start">Employees</span>
        <span className="text-gray-100">
          {parseInt(employees, 10).toLocaleString("en-US")}
        </span>
      </div>
    </div>
  );
}

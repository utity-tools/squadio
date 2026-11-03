import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

/** What the page shows of the member's organization: structure only, never money. */
export type OrganizationOverviewProps = {
  name: string;
  /** Adopted from a visitor's copy: its data is the demo's synthetic example (ADR 0012). */
  example: boolean;
  projects: {
    id: string;
    name: string;
    client: string;
    scenarios: { id: string; name: string; chosen: boolean }[];
  }[];
};

/** The member's organization: its name, whether it is the demo's example, and its projects. */
export function OrganizationOverview({ name, example, projects }: OrganizationOverviewProps) {
  const t = useTranslations("Organization");
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 text-left">
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
      {example && (
        <p className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          {t("exampleBanner")}
        </p>
      )}
      <section aria-labelledby="organization-projects" className="flex flex-col gap-3">
        <h2 id="organization-projects" className="text-lg font-semibold">
          {t("projectsHeading")}
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-col gap-1">
                <p className="font-medium">
                  {t("project", { name: project.name, client: project.client })}
                </p>
                {project.scenarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noScenarios")}</p>
                ) : (
                  <ul className="flex flex-col gap-1 ps-4">
                    {project.scenarios.map((scenario) => (
                      <li key={scenario.id} className="text-sm">
                        <Link
                          href={`/scenarios/${scenario.id}`}
                          className="underline underline-offset-4 hover:text-foreground"
                        >
                          {scenario.name}
                        </Link>
                        {scenario.chosen && (
                          <span className="text-muted-foreground"> · {t("chosen")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

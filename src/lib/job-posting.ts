/**
 * schema.org JobPosting for a careers listing's apply page, which is what
 * Google for Jobs reads. Pure: it takes the facts the page already shows and
 * adds nothing the person didn't enter. A missing fact is left out rather
 * than guessed, so a job with no pay range has no baseSalary.
 */

const EMPLOYMENT: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
  temporary: "TEMPORARY",
};
const UNIT: Record<string, string> = { hour: "HOUR", month: "MONTH", year: "YEAR" };

export type JobPostingInput = {
  title: string;
  descriptionHtml: string;
  postedAt: Date;
  url: string;
  company: string;
  companyWebsite?: string;
  location: string;
  workplace: string;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  salaryPeriod: string;
};

export function jobPostingLd(j: JobPostingInput) {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: j.title,
    description: j.descriptionHtml,
    datePosted: j.postedAt.toISOString().slice(0, 10),
    url: j.url,
    directApply: true,
    hiringOrganization: { "@type": "Organization", name: j.company || "Hiring company", ...(j.companyWebsite ? { sameAs: j.companyWebsite } : {}) },
  };
  if (EMPLOYMENT[j.employmentType]) ld.employmentType = EMPLOYMENT[j.employmentType];
  const location = j.location.trim();
  if (j.workplace === "remote") {
    ld.jobLocationType = "TELECOMMUTE";
    if (location) ld.applicantLocationRequirements = { "@type": "Country", name: location };
  } else if (location) {
    ld.jobLocation = { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: location } };
  }
  const min = j.salaryMin ?? j.salaryMax;
  const max = j.salaryMax ?? j.salaryMin;
  if (min != null && UNIT[j.salaryPeriod]) {
    ld.baseSalary = {
      "@type": "MonetaryAmount",
      currency: j.salaryCurrency,
      value: { "@type": "QuantitativeValue", ...(min === max ? { value: min } : { minValue: min, maxValue: max }), unitText: UNIT[j.salaryPeriod] },
    };
  }
  return ld;
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so a description can't close the tag. */
export function ldJson(ld: unknown) {
  return JSON.stringify(ld).replace(/</g, "\\u003c");
}

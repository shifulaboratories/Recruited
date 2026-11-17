import { notFound } from "next/navigation";
import { publicListing } from "@/lib/data/public";
import { formatPay } from "@/lib/data/jobs";
import { toHtml } from "@/lib/boards";
import { PublicForm } from "@/components/public-form";
import { Lockup } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * A listing's apply page. Public, reached by an unguessable slug, and the
 * reason every application knows which listing brought it. It shows the
 * listing and the job's application form, and nothing else from the workspace.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const l = await publicListing((await params).slug);
  return { title: l ? `${l.title}${l.company ? ` at ${l.company}` : ""}` : "Not found", robots: { index: false } };
}

export default async function ApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = await publicListing(slug);
  if (!l) notFound();
  const pay = formatPay(l.job);
  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      {l.preview && (
        <p className="text-xs text-rt-muted bg-rt-subtle rounded p-2">Preview: this listing is still a draft. Applications sent now are kept.</p>
      )}
      <header className="space-y-1">
        {l.company && <p className="eyebrow">{l.company}</p>}
        <h1 className="text-3xl font-semibold" style={{ letterSpacing: "var(--rt-tracking-display)" }}>
          {l.title}
        </h1>
        <p className="text-rt-muted">
          {[l.job.location, l.job.workplace, l.job.employmentType.replace("_", " "), pay].filter(Boolean).join(" · ")}
        </p>
      </header>
      {l.body && (
        <article
          className="space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-rt-primary"
          dangerouslySetInnerHTML={{ __html: toHtml(l.body) }}
        />
      )}
      <section className="card p-5 md:p-6 space-y-4">
        <h2 className="text-lg font-semibold">Apply</h2>
        {l.open ? (
          <PublicForm
            questions={l.questions}
            endpoint={`/api/apply/${slug}`}
            askIdentity
            doneText="Thanks, your application is in. You'll hear back by email."
          />
        ) : (
          <p className="text-rt-muted">This role isn&apos;t taking applications any more.</p>
        )}
      </section>
      <footer className="text-xs text-rt-faint flex items-center gap-2">
        <span>Hiring with</span> <Lockup size={12} />
      </footer>
    </main>
  );
}

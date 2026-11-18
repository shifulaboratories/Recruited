import { baseUrl, requireUser } from "@/lib/auth";
import { mcpPath, primaryConnection } from "@/lib/data/connections";
import { loadSampleAction, rotateConnection, saveAccount, wipeSampleAction } from "@/server/actions";
import { hasSample } from "@/lib/data/sample";
import { ActionForm, CopyButton } from "@/components/forms";
import { TOOLS } from "@/lib/mcp/tools";

export const metadata = { title: "Connect Claude" };

export default async function SettingsPage() {
  const user = await requireUser();
  const conn = await primaryConnection(user.id);
  const url = `${await baseUrl()}${mcpPath(conn.token)}`;
  const sample = await hasSample(user.id);
  return (
    <div className="space-y-8 max-w-2xl">
      <header className="rise space-y-1.5">
        <p className="eyebrow">Settings</p>
        <h1 className="h-page">Connect Claude</h1>
        <p className="text-rt-muted">
          Recruited is built to be run from a conversation. Add this URL as a custom connector and Claude gets {TOOLS.length} tools: writing
          listings for each board, building forms, reading applicants and moving them along.
        </p>
      </header>
      <section className="card rise p-5 space-y-4" style={{ ["--i" as string]: 1 }}>
        <div className="flex flex-wrap items-center gap-2">
          <code className="text-xs inset px-2.5 py-2 break-all flex-1">{url}</code>
          <CopyButton text={url} label="Copy URL" />
        </div>
        <ol className="list-decimal pl-5 text-rt-muted space-y-1.5 marker:text-rt-faint">
          <li>
            In Claude, open{" "}
            <a className="link" href="https://claude.ai/customize/connectors" target="_blank" rel="noreferrer">
              Connectors
            </a>{" "}
            and choose Add custom connector.
          </li>
          <li>Paste the URL. No sign-in is needed: the URL is the key, so treat it like a password.</li>
          <li>Ask: &ldquo;I&apos;m hiring a part-time bookkeeper. Post it on OnlineJobs.ph.&rdquo;</li>
        </ol>
        <form action={rotateConnection.bind(null, conn.id)}>
          <button className="btn btn-quiet text-xs">Make a new URL (the old one stops working)</button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="h-section mb-1">Your company</h2>
        <p className="text-[12.5px] text-rt-faint mb-3">Shown at the top of every public job page. Claude can write the description with you.</p>
        <ActionForm action={saveAccount} submit="Save">
          <label className="block space-y-1">
            <span className="text-rt-muted">Name</span>
            <input className="field" name="companyName" defaultValue={user.companyName} />
          </label>
          <label className="block space-y-1">
            <span className="text-rt-muted">About, in a few sentences: what you make, who for, how you work</span>
            <textarea className="field min-h-24" name="companyAbout" defaultValue={user.companyAbout} maxLength={2000} />
          </label>
          <label className="block space-y-1">
            <span className="text-rt-muted">Website</span>
            <input className="field" name="companyWebsite" type="url" placeholder="https://" defaultValue={user.companyWebsite} />
          </label>
        </ActionForm>
      </section>

      <section className="card p-5">
        <h2 className="h-section mb-3">Your account</h2>
        <ActionForm action={saveAccount} submit="Save">
          <label className="block space-y-1">
            <span className="text-rt-muted">Your name</span>
            <input className="field" name="name" defaultValue={user.name} />
          </label>
          <label className="block space-y-1">
            <span className="text-rt-muted">Email</span>
            <input className="field" name="email" defaultValue={user.email} />
          </label>
          <label className="block space-y-1">
            <span className="text-rt-muted">New password (leave empty to keep it)</span>
            <input className="field" name="password" type="password" autoComplete="new-password" />
          </label>
        </ActionForm>
      </section>

      <section className="card p-5 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <h2 className="h-section">Sample workspace</h2>
          <p className="text-[12.5px] text-rt-muted">
            {sample
              ? "A made-up support role with six applicants is loaded. Removing it deletes only that role and its made-up people."
              : "A made-up support role with six applicants, so you can see how everything works before posting a real one."}
          </p>
        </div>
        <form action={sample ? wipeSampleAction : loadSampleAction}>
          <button className={`btn text-xs ${sample ? "" : "btn-primary"}`}>{sample ? "Remove sample" : "Load sample"}</button>
        </form>
      </section>
    </div>
  );
}

import { baseUrl, requireUser } from "@/lib/auth";
import { mcpPath, primaryConnection } from "@/lib/data/connections";
import {
  connectMailboxAction,
  disconnectMailboxAction,
  loadSampleAction,
  rotateConnection,
  saveAccount,
  saveReceiptAction,
  setSpamCheck,
  wipeSampleAction,
} from "@/server/actions";
import { getMailbox } from "@/lib/data/mailbox";
import { spamCheckStatus } from "@/lib/data/settings";
import { hasSample } from "@/lib/data/sample";
import { ActionForm, CopyButton } from "@/components/forms";
import { TOOLS } from "@/lib/mcp/tools";

export const metadata = { title: "Connect Claude" };

export default async function SettingsPage() {
  const user = await requireUser();
  const conn = await primaryConnection(user.id);
  const origin = await baseUrl();
  const url = `${origin}${mcpPath(conn.token)}`;
  const sample = await hasSample(user.id);
  const spam = await spamCheckStatus();
  const mail = await getMailbox(user.id);
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
          <label className="block space-y-1">
            <span className="text-rt-muted">
              Careers page address: {origin}/careers/<b>{user.careersSlug || "your-company"}</b>. It lists every open job with a live careers listing.
            </span>
            <input className="field" name="careersSlug" placeholder="acme" defaultValue={user.careersSlug ?? ""} />
          </label>
          {user.careersSlug && (
            <p className="text-[12.5px]">
              <a className="text-rt-primary underline" href={`/careers/${user.careersSlug}`} target="_blank" rel="noreferrer">
                Open your careers page
              </a>
            </p>
          )}
        </ActionForm>
      </section>

      <section className="card p-5 space-y-4">
        <div>
          <h2 className="h-section mb-1">Your mailbox</h2>
          <p className="text-[12.5px] text-rt-muted">
            Recruited sends from your own email account, never from an address of its own. Once it&apos;s connected, everyone who applies through
            an apply link gets a short receipt, and a draft goes out when you press Send on it or tell Claude to send it. Nothing else leaves
            by itself, and no more than {mail.dailyLimit} a day.
            {mail.connected ? ` Connected as ${mail.fromEmail}; ${mail.sentLast24h} sent in the last 24 hours.` : " Not connected."}
          </p>
        </div>
        <ActionForm action={connectMailboxAction} submit={mail.connected ? "Save and test" : "Connect"}>
          <p className="text-[12.5px] text-rt-faint">
            Gmail: smtp.gmail.com, port 587, and an app password (Google account, Security, App passwords). Microsoft 365: smtp.office365.com, port 587.
            Recruited signs in before saving, so a saved mailbox is one that works.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_90px_170px] gap-3">
            <label className="block space-y-1">
              <span className="text-rt-muted">Mail server</span>
              <input className="field" name="host" placeholder="smtp.gmail.com" defaultValue={mail.connected ? mail.host : ""} autoComplete="off" />
            </label>
            <label className="block space-y-1">
              <span className="text-rt-muted">Port</span>
              <input className="field" name="port" inputMode="numeric" defaultValue={mail.connected ? mail.port : 587} />
            </label>
            <label className="block space-y-1">
              <span className="text-rt-muted">Security</span>
              <select className="field" name="security" defaultValue={mail.connected ? mail.security : "starttls"}>
                <option value="starttls">STARTTLS (587)</option>
                <option value="tls">TLS (465)</option>
                <option value="none">None (private relay)</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-rt-muted">Username</span>
              <input className="field" name="username" defaultValue={mail.connected ? mail.username : user.email} autoComplete="off" />
            </label>
            <label className="block space-y-1">
              <span className="text-rt-muted">Password or app password{mail.connected ? " (saved; leave empty to keep it)" : ""}</span>
              <input className="field" name="password" type="password" autoComplete="new-password" />
            </label>
            <label className="block space-y-1">
              <span className="text-rt-muted">From address applicants see</span>
              <input className="field" name="fromEmail" type="email" defaultValue={mail.connected ? mail.fromEmail : user.email} />
            </label>
            <label className="block space-y-1">
              <span className="text-rt-muted">From name</span>
              <input className="field" name="fromName" placeholder={user.companyName ? `${user.name || "Dana"} at ${user.companyName}` : ""} defaultValue={mail.connected ? mail.fromName : ""} />
            </label>
          </div>
        </ActionForm>
        {mail.connected && (
          <>
            <ActionForm action={saveReceiptAction} submit="Save receipt" className="border-t border-rt-border pt-4">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="on" defaultChecked={mail.receipt.on} />
                <span>Send a receipt to everyone who applies</span>
              </label>
              <p className="text-[12.5px] text-rt-faint">
                Leave these empty for the wording shown. You can use {"{first_name}"}, {"{job}"}, {"{company}"}, {"{sender}"} and {"{status_link}"}, the applicant&apos;s own page showing where their application stands. A receipt says the
                application arrived; promise a reply only if you mean to keep it.
              </p>
              <input className="field" name="subject" placeholder={mail.defaultReceipt.subject} defaultValue={mail.receipt.subject} />
              <textarea className="field min-h-28" name="body" placeholder={mail.defaultReceipt.body} defaultValue={mail.receipt.body} />
            </ActionForm>
            <form action={disconnectMailboxAction}>
              <button className="btn btn-quiet text-xs">Disconnect the mailbox</button>
            </form>
          </>
        )}
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

      {user.role === "OWNER" && (
        <section className="card p-5">
          <h2 className="h-section mb-1">Spam check</h2>
          <p className="text-[12.5px] text-rt-muted mb-3">
            Apply pages already have a hidden trap field and an hourly limit per address. If fake applications still get through, add a
            Cloudflare Turnstile widget for your apply pages&apos; domain (free, in the Cloudflare dashboard under Turnstile) and paste its keys
            here. {spam.on ? "It's on now." : "It's off now."}
          </p>
          <ActionForm action={setSpamCheck} submit={spam.on ? "Replace keys" : "Turn on"}>
            <label className="block space-y-1">
              <span className="text-rt-muted">Site key</span>
              <input className="field" name="siteKey" defaultValue={spam.siteKey ?? ""} autoComplete="off" />
            </label>
            <label className="block space-y-1">
              <span className="text-rt-muted">Secret key{spam.on ? " (saved; paste it again to change the keys)" : ""}</span>
              <input className="field" name="secretKey" type="password" autoComplete="off" />
            </label>
          </ActionForm>
          {spam.on && (
            <ActionForm action={setSpamCheck} submit="Turn off" className="mt-3">
              <input type="hidden" name="off" value="1" />
            </ActionForm>
          )}
        </section>
      )}

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

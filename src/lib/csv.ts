/**
 * Applicant exports from job boards: parse the CSV, recognise which columns
 * hold the name, email, phone and links, and turn each row into an applicant.
 * Pure module; the import itself is src/lib/data/imports.ts.
 *
 * Boards change their export headers without notice, so columns are matched
 * by alias rather than by a fixed layout, and the caller can always name a
 * column outright. Columns that aren't contact details are kept as a note.
 */

/** RFC 4180, plus a leading BOM, CRLF or LF, and tab- or semicolon-separated files. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = count("\t") > count(",") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === sep) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export const IMPORT_FIELDS = ["name", "first_name", "last_name", "email", "phone", "links"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMap = Partial<Record<ImportField, string[]>>;

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Header spellings seen in Indeed, LinkedIn, Wellfound, Upwork and spreadsheet exports, normalised. */
const ALIASES: Record<ImportField, string[]> = {
  name: ["name", "full name", "candidate", "candidate name", "applicant", "applicant name"],
  first_name: ["first name", "firstname", "given name"],
  last_name: ["last name", "lastname", "surname", "family name"],
  email: ["email", "e mail", "email address", "candidate email", "applicant email", "contact email"],
  phone: ["phone", "phone number", "mobile", "mobile number", "mobile phone", "telephone", "contact number", "candidate phone"],
  links: ["linkedin", "linkedin profile", "linkedin url", "profile url", "profile", "public profile url", "resume", "resume url", "cv", "portfolio", "portfolio url", "website", "github", "indeed profile"],
};

/** Which columns hold which field. An explicit choice wins over a guess. */
export function mapColumns(headers: string[], override: Partial<Record<ImportField, string>> = {}): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<string>();
  for (const f of IMPORT_FIELDS) {
    const want = override[f];
    if (want) {
      const hit = headers.find((h) => norm(h) === norm(want));
      if (hit) {
        map[f] = [hit];
        used.add(hit);
      }
    }
  }
  for (const f of IMPORT_FIELDS) {
    if (map[f]) continue;
    const hits = headers.filter((h) => !used.has(h) && ALIASES[f].includes(norm(h)));
    if (!hits.length) continue;
    map[f] = f === "links" ? hits : [hits[0]];
    hits.slice(0, f === "links" ? undefined : 1).forEach((h) => used.add(h));
  }
  return map;
}

/** A best guess at the board, from the header row alone. Only a label for `source`. */
export function guessBoard(headers: string[]): string {
  const h = headers.map(norm);
  if (h.some((x) => x.includes("linkedin")) || (h.includes("first name") && h.includes("email address"))) return "linkedin";
  if (h.some((x) => x.includes("indeed")) || h.includes("relevant experience") || h.includes("candidate location")) return "indeed";
  return "";
}

export type ImportRow = {
  line: number;
  name: string;
  email: string;
  phone: string;
  links: string[];
  /** The columns that aren't contact details, as "Header: value" lines. */
  extra: string[];
  problem?: string;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function rowsToApplicants(rows: string[][], map: ColumnMap): ImportRow[] {
  const [headers, ...body] = rows;
  if (!headers) return [];
  const idx = (h: string) => headers.indexOf(h);
  const get = (r: string[], f: ImportField) => (map[f] ?? []).map((h) => (r[idx(h)] ?? "").trim()).filter(Boolean);
  const mapped = new Set(Object.values(map).flat());
  const seen = new Set<string>();
  return body.map((r, i) => {
    const line = i + 2;
    const name = get(r, "name")[0] || [get(r, "first_name")[0], get(r, "last_name")[0]].filter(Boolean).join(" ");
    const email = (get(r, "email")[0] ?? "").toLowerCase();
    const links = get(r, "links").flatMap((v) => v.split(/[\s,;]+/)).filter((v) => /^https?:\/\//i.test(v));
    const extra = headers
      .map((h, j) => [h, (r[j] ?? "").trim()] as const)
      .filter(([h, v]) => v && !mapped.has(h))
      .map(([h, v]) => `${h.trim()}: ${v}`);
    const row: ImportRow = { line, name, email, phone: get(r, "phone")[0] ?? "", links: Array.from(new Set(links)), extra };
    if (!email) row.problem = "no email address";
    else if (!EMAIL.test(email)) row.problem = `"${email}" isn't an email address`;
    else if (!name) row.problem = "no name";
    else if (seen.has(email)) row.problem = "same email as an earlier row";
    if (!row.problem) seen.add(email);
    return row;
  });
}

export const MAX_IMPORT_ROWS = 1000;

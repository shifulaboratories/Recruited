import { db } from "@/lib/db";
import { notFound } from "@/lib/data/errors";

/**
 * Files applicants attached. Every read names its columns, and only
 * `readUpload` selects `data` (see the Upload model's comment). Uploads have no
 * archivedAt of their own, so each read spells the archive filter through the
 * application and the job.
 */

const visible = (userId: string) => ({
  userId,
  answer: { submission: { application: { archivedAt: null, job: { archivedAt: null } } } },
});

export async function uploadMeta(userId: string, uploadId: string) {
  const u = await db.upload.findFirst({
    where: { id: uploadId, ...visible(userId) },
    select: { id: true, filename: true, mimeType: true, size: true, answer: { select: { label: true, submission: { select: { applicationId: true } } } } },
  });
  if (!u) notFound("file");
  return { id: u.id, filename: u.filename, mimeType: u.mimeType, size: u.size, question: u.answer.label, applicationId: u.answer.submission.applicationId };
}

/** The one read that loads the bytes. */
export async function readUpload(userId: string, uploadId: string) {
  const u = await db.upload.findFirst({
    where: { id: uploadId, ...visible(userId) },
    select: { id: true, filename: true, mimeType: true, size: true, data: true },
  });
  if (!u) notFound("file");
  return u;
}

export function filePath(uploadId: string) {
  return `/files/${uploadId}`;
}

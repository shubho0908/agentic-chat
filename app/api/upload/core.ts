import { createUploadthing, type FileRouter, UTFiles } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";
import { MAX_FILE_ATTACHMENTS } from "@/constants/upload";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const f = createUploadthing();

export const ourFileRouter = {
  ragDocumentUploader: f({
    image: { maxFileSize: "2MB", maxFileCount: MAX_FILE_ATTACHMENTS },
    pdf: { maxFileSize: "4MB", maxFileCount: MAX_FILE_ATTACHMENTS },
    text: { maxFileSize: "4MB", maxFileCount: MAX_FILE_ATTACHMENTS },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileSize: "4MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
    "application/msword": {
      maxFileSize: "4MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      maxFileSize: "4MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
    "application/vnd.ms-excel": {
      maxFileSize: "4MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
    "text/csv": {
      maxFileSize: "4MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
    "text/markdown": {
      maxFileSize: "4MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
  })
    .input(z.object({}))
    .middleware(async ({ files }) => {
      const session = await auth.api.getSession({ headers: await headers() });

      if (!session?.user) throw new UploadThingError("Unauthorized");

      const userId = session.user.id;

      const fileOverrides = files.map((file) => ({
        ...file,
        customId: `${userId}/${Date.now()}-${file.name}`,
      }));

      return { userId, [UTFiles]: fileOverrides };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return { 
        uploadedBy: metadata.userId, 
        url: file.ufsUrl,
        name: file.name,
        type: file.type,
        customId: file.customId,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;

import { createUploadthing, type FileRouter, UTFiles } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";
import { z } from "zod";
import { MAX_FILE_ATTACHMENTS } from "@/constants/upload";

const f = createUploadthing();

export const ourFileRouter = {
  ragDocumentUploader: f({
    image: { maxFileSize: "8MB", maxFileCount: MAX_FILE_ATTACHMENTS },
    pdf: { maxFileSize: "16MB", maxFileCount: MAX_FILE_ATTACHMENTS },
    text: { maxFileSize: "4MB", maxFileCount: MAX_FILE_ATTACHMENTS },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileSize: "16MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      maxFileSize: "16MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
    "application/vnd.ms-excel": {
      maxFileSize: "16MB",
      maxFileCount: MAX_FILE_ATTACHMENTS,
    },
  })
    .input(z.object({ userHash: z.string().min(1) }))
    .middleware(async ({ input, files }) => {
      const { userHash } = input;

      if (!userHash) throw new UploadThingError("Unauthorized");

      const fileOverrides = files.map((file) => ({
        ...file,
        customId: `${userHash}/${Date.now()}-${file.name}`,
      }));

      return { userHash, [UTFiles]: fileOverrides };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("RAG document upload complete for userHash:", metadata.userHash.substring(0, 8) + "...");
      console.log("File url:", file.ufsUrl);
      console.log("File name:", file.name);
      console.log("File type:", file.type);
      console.log("Custom ID:", file.customId);

      return { 
        uploadedBy: metadata.userHash, 
        url: file.ufsUrl,
        name: file.name,
        type: file.type,
        customId: file.customId,
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;

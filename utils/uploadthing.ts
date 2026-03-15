import { generateReactHelpers } from "@uploadthing/react";

import type { OurFileRouter } from "@/app/api/upload/core";

export const { uploadFiles } = generateReactHelpers<OurFileRouter>({
  url: "/api/upload",
});

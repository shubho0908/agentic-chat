import { generateReactHelpers } from "@uploadthing/react";

import type { OurFileRouter } from "@/app/api/upload/core";
import { apiRoutes } from "@/lib/routes";

export const { uploadFiles } = generateReactHelpers<OurFileRouter>({
  url: apiRoutes.upload,
});

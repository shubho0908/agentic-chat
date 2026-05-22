import { STRING_ENUM } from "@/constants/stringEnums";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== STRING_ENUM.PRODUCTION) globalForPrisma.prisma = prisma;

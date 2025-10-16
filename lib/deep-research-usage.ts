import { prisma } from './prisma';

const MONTHLY_LIMIT = 3;

export interface DeepResearchUsageInfo {
  usageCount: number;
  limit: number;
  remaining: number;
  canUse: boolean;
  resetDate: Date | string;
}

function getCurrentMonthYear(): { year: number; month: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

function getResetDate(): Date {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth;
}

export async function checkDeepResearchUsage(userId: string): Promise<DeepResearchUsageInfo> {
  const { year, month } = getCurrentMonthYear();

  const usage = await prisma.deepResearchUsage.upsert({
    where: {
      userId_year_month: {
        userId,
        year,
        month,
      },
    },
    update: {},
    create: {
      userId,
      year,
      month,
      usageCount: 0,
    },
  });

  const remaining = Math.max(0, MONTHLY_LIMIT - usage.usageCount);
  const canUse = remaining > 0;

  return {
    usageCount: usage.usageCount,
    limit: MONTHLY_LIMIT,
    remaining,
    canUse,
    resetDate: getResetDate(),
  };
}

export async function incrementDeepResearchUsage(userId: string): Promise<DeepResearchUsageInfo> {
  const { year, month } = getCurrentMonthYear();

  const currentUsage = await checkDeepResearchUsage(userId);
  
  if (!currentUsage.canUse) {
    const resetDate = currentUsage.resetDate instanceof Date ? currentUsage.resetDate : new Date(currentUsage.resetDate);
    throw new Error(`Deep research limit reached. You have used all ${MONTHLY_LIMIT} requests this month. Resets on ${resetDate.toLocaleDateString()}.`);
  }
  const updated = await prisma.deepResearchUsage.update({
    where: {
      userId_year_month: {
        userId,
        year,
        month,
      },
    },
    data: {
      usageCount: {
        increment: 1,
      },
    },
  });

  const remaining = Math.max(0, MONTHLY_LIMIT - updated.usageCount);

  return {
    usageCount: updated.usageCount,
    limit: MONTHLY_LIMIT,
    remaining,
    canUse: remaining > 0,
    resetDate: getResetDate(),
  };
}

export async function resetAllUsage(): Promise<void> {
  const { year, month } = getCurrentMonthYear();
  
  await prisma.deepResearchUsage.updateMany({
    where: {
      year: {
        lt: year,
      },
    },
    data: {
      usageCount: 0,
    },
  });

  await prisma.deepResearchUsage.updateMany({
    where: {
      year,
      month: {
        lt: month,
      },
    },
    data: {
      usageCount: 0,
    },
  });
}

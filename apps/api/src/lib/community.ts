/** Public organizer-authored context. It never changes contract rules or claim rights. */
export interface CommunityDetails {
  communityPurpose: string;
  communityBeneficiaries: string;
  communityDistribution: string;
  communityGoalUsd: number | null;
}

export function parseCommunityDetails(body: Record<string, unknown>, required: boolean): CommunityDetails | string {
  const limits = [
    ["communityPurpose", "Community purpose", 20, 2000],
    ["communityBeneficiaries", "Who benefits", 10, 2000],
    ["communityDistribution", "Distribution explanation", 20, 4000],
  ] as const;
  const texts: Record<string, string> = {};
  for (const [key, label, min, max] of limits) {
    if (body[key] !== undefined && typeof body[key] !== "string") return `${label} must be text`;
    const value = typeof body[key] === "string" ? body[key].trim() : "";
    if ((required && value.length < min) || value.length > max) return `${label} must be ${required ? min : 0}–${max} characters`;
    texts[key] = value;
  }
  const rawGoal = body.communityGoalUsd;
  const goal = rawGoal === undefined || rawGoal === null ? null : rawGoal;
  if (goal !== null && (typeof goal !== "number" || !Number.isFinite(goal) || goal <= 0 || goal > 1_000_000_000 || Math.abs(goal * 100 - Math.round(goal * 100)) > 0.00001)) {
    return "Community goal must be a positive amount up to $1,000,000,000 with at most two decimal places";
  }
  return {
    communityPurpose: texts.communityPurpose,
    communityBeneficiaries: texts.communityBeneficiaries,
    communityDistribution: texts.communityDistribution,
    communityGoalUsd: goal as number | null,
  };
}

/** Never substitute a malformed historical snapshot with invented contributions. */
export function summarizeCommunitySales(sales: { amountUsd: number; splitSnapshot: string }[]) {
  const total = { salesCount: sales.length, grossUsd: 0, vendorUsd: 0, operatorUsd: 0, communityUsd: 0, unclassifiedSales: 0 };
  for (const sale of sales) {
    total.grossUsd += sale.amountUsd;
    try {
      const snapshot = JSON.parse(sale.splitSnapshot) as Record<string, unknown>;
      const values = [snapshot.vendorAmountUsd, snapshot.operatorAmountUsd, snapshot.communityAmountUsd];
      if (!values.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0)) throw new Error("Invalid amounts");
      if (Math.abs((values as number[]).reduce((sum, value) => sum + value, 0) - sale.amountUsd) > 0.0000001) throw new Error("Split does not match the sale");
      total.vendorUsd += values[0] as number;
      total.operatorUsd += values[1] as number;
      total.communityUsd += values[2] as number;
    } catch { total.unclassifiedSales++; }
  }
  return total;
}

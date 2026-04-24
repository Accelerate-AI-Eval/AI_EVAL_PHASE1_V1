/**
 * Calculate ROI metrics from assessment data for the Customer Risk Report.
 * Uses vendor COTS payload; optional overrides can be added to the submit payload later.
 */
const DEFAULT_TIME_SAVED_MIN_PER_DAY = 105;
const DEFAULT_EMPLOYEES = 50_000;
const DEFAULT_WORKING_DAYS_PER_YEAR = 250;
const DEFAULT_AVG_HOURLY_COST_DOLLARS = 35;
const DEFAULT_COST_PER_USER_PER_MONTH_DOLLARS = 22;
function parseNumberFromPayload(payload, key, camelKey, defaultValue) {
    const v = payload[key] ?? payload[camelKey];
    if (v == null)
        return defaultValue;
    if (typeof v === "number" && !Number.isNaN(v))
        return Math.max(0, v);
    const s = String(v).trim();
    if (!s)
        return defaultValue;
    const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
    return Number.isNaN(n) ? defaultValue : Math.max(0, n);
}
/** Parse a dollar string like "$13.2M", "13.2M", "$13,200,000" into a number. */
function parseDollarAmount(s) {
    if (s == null || typeof s !== "string")
        return null;
    const trimmed = s.trim();
    if (!trimmed)
        return null;
    let numStr = trimmed.replace(/[\s,$]/g, "");
    const isM = /M|m(?:illion)?$/i.test(numStr);
    const isK = /K|k(?: Thousand)?$/i.test(numStr);
    numStr = numStr.replace(/[MmKk]$/i, "").replace(/illion$/, "").trim();
    const n = parseFloat(numStr);
    if (Number.isNaN(n))
        return null;
    if (isM)
        return n * 1_000_000;
    if (isK)
        return n * 1_000;
    return n;
}
function formatCompactNumber(n) {
    if (n >= 1_000_000_000)
        return `${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B`;
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(3).replace(/\.?0+$/, "")}M`;
    if (n >= 1_000)
        return `${(n / 1_000).toFixed(2).replace(/\.?0+$/, "")}K`;
    return Math.round(n).toLocaleString();
}
function formatCurrency(n) {
    if (n >= 1_000_000_000)
        return `$${(n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B/year`;
    if (n >= 1_000_000)
        return `$${(n / 1_000_000).toFixed(0)}M/year`;
    if (n >= 1_000)
        return `$${(n / 1_000).toFixed(1)}K/year`;
    return `$${Math.round(n).toLocaleString()}/year`;
}
function formatPaybackMonths(months) {
    if (months < 1)
        return "<1 month";
    if (months <= 12)
        return `${Math.round(months)} month${Math.round(months) !== 1 ? "s" : ""}`;
    const years = months / 12;
    return years < 2 ? `${years.toFixed(1)} years` : `${Math.round(years)} years`;
}
/**
 * Compute ROI analysis from vendor COTS assessment payload.
 * Uses optional payload fields if present; otherwise uses defaults and parses customer_budget_range.
 */
export function calculateRoiFromAssessment(payload) {
    const timeSavedMin = parseNumberFromPayload(payload, "time_saved_per_employee_minutes", "timeSavedPerEmployeeMinutes", DEFAULT_TIME_SAVED_MIN_PER_DAY);
    const employees = parseNumberFromPayload(payload, "target_users", "targetUsers", DEFAULT_EMPLOYEES);
    const workingDays = parseNumberFromPayload(payload, "working_days_per_year", "workingDaysPerYear", DEFAULT_WORKING_DAYS_PER_YEAR);
    const hourlyCost = parseNumberFromPayload(payload, "average_hourly_cost_dollars", "averageHourlyCostDollars", DEFAULT_AVG_HOURLY_COST_DOLLARS);
    const costPerUserMonth = parseNumberFromPayload(payload, "cost_per_user_per_month_dollars", "costPerUserPerMonthDollars", DEFAULT_COST_PER_USER_PER_MONTH_DOLLARS);
    const budgetStr = payload.customer_budget_range != null
        ? String(payload.customer_budget_range)
        : payload.customerBudgetRange != null
            ? String(payload.customerBudgetRange)
            : "";
    const parsedAnnualCost = parseDollarAmount(budgetStr);
    const annualHoursRecoveredNum = (timeSavedMin * employees * workingDays) / 60;
    const productivityValueNum = annualHoursRecoveredNum * hourlyCost;
    const annualCostNum = parsedAnnualCost != null && parsedAnnualCost > 0
        ? parsedAnnualCost
        : employees * costPerUserMonth * 12;
    const roiRatio = annualCostNum > 0 ? productivityValueNum / annualCostNum : 0;
    const paybackMonths = productivityValueNum > 0
        ? (annualCostNum / (productivityValueNum / 12))
        : 0;
    const timeSavedDisplay = `${timeSavedMin} minutes/day`;
    const timeSavedSource = "Source: PA pilot program (2025)";
    const annualHoursDisplay = annualHoursRecoveredNum >= 1_000_000
        ? `${(annualHoursRecoveredNum / 1_000_000).toFixed(3).replace(/\.?0+$/, "")}M hours`
        : `${Math.round(annualHoursRecoveredNum).toLocaleString()} hours`;
    const annualHoursCalculation = `${timeSavedMin} min/day × ${employees.toLocaleString()} employees × ${workingDays} working days`;
    const productivityValueDisplay = formatCurrency(productivityValueNum);
    const productivityValueCalculation = `${formatCompactNumber(annualHoursRecoveredNum)} hours × $${hourlyCost}/hr average state employee cost`;
    const annualCostDisplay = formatCurrency(annualCostNum);
    const annualCostCalculation = parsedAnnualCost != null && parsedAnnualCost > 0
        ? `From customer budget range`
        : `${employees.toLocaleString()} users × $${costPerUserMonth}/month × 12 months`;
    const roiMultipleDisplay = roiRatio >= 1 ? `${Math.round(roiRatio)}:1` : roiRatio > 0 ? `<1:1` : "—";
    const roiMultipleCalculation = `$${formatCompactNumber(productivityValueNum)} productivity value ÷ $${formatCompactNumber(annualCostNum)} cost`;
    const paybackDisplay = formatPaybackMonths(paybackMonths);
    const paybackSource = "Based on pilot productivity data";
    return {
        timeSavedPerEmployee: timeSavedDisplay,
        timeSavedSource,
        annualHoursRecovered: annualHoursDisplay,
        annualHoursRecoveredCalculation: annualHoursCalculation,
        productivityValue: productivityValueDisplay,
        productivityValueCalculation,
        annualCost: annualCostDisplay,
        annualCostCalculation,
        roiMultiple: roiMultipleDisplay,
        roiMultipleCalculation,
        paybackPeriod: paybackDisplay,
        paybackSource,
        comparisonAlternatives: undefined,
    };
}

/**
 * Reusable summary card for Product Profile: title + icon, primary detail, secondary detail.
 * Supports variants: default text, trust score (green large), verified badge (pill).
 */
import type { ReactNode } from "react";
import "./ProductProfileSummaryCard.css";

export type SummaryCardIconColor = "blue" | "green" | "purple" | "default";

export type SummaryCardPrimaryVariant = "default" | "trustScore" | "verifiedBadge";

export interface ProductProfileSummaryCardProps {
  /** Card title (e.g. "Trust Score", "Attestation Status") */
  title: string;
  /** Icon element (e.g. from lucide-react) */
  icon: ReactNode;
  /** Primary content: string or custom element (e.g. Verified badge) */
  primary: ReactNode;
  /** Secondary line (e.g. "92% compliance", "Completed: 20/12/2025") */
  secondary: string;
  /** Icon color variant */
  iconColor?: SummaryCardIconColor;
  /** Primary content style variant */
  primaryVariant?: SummaryCardPrimaryVariant;
}

export default function ProductProfileSummaryCard({
  title,
  icon,
  primary,
  secondary,
  iconColor = "default",
  primaryVariant = "default",
}: ProductProfileSummaryCardProps) {
  const primaryClass =
    primaryVariant === "trustScore"
      ? "summary_card_primary summary_card_primary_trust_score"
      : primaryVariant === "verifiedBadge"
        ? "summary_card_primary summary_card_primary_badge_wrapper"
        : "summary_card_primary";

  return (
    <div className="summary_card">
      <div className="summary_card_header">
        <span className={`summary_card_icon summary_card_icon_${iconColor}`} aria-hidden>
          {icon}
        </span>
        <h3 className="summary_card_title">{title}</h3>
      </div>
      <div className="summary_card_body">
        <div className={primaryClass}>{primary}</div>
        {secondary.trim() ? <p className="summary_card_secondary">{secondary}</p> : null}
      </div>
    </div>
  );
}

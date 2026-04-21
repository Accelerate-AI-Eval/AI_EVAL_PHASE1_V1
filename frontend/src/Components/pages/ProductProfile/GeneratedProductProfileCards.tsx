/**
 * Renders generated product profile report: Trust Score cards on top, then section cards.
 * Data comes from POST /vendorSelfAttestation/generate-profile (no file).
 */
import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import {
  Package,
  Cpu,
  Brain,
  Lock,
  Database,
  Phone,
  Award,
  Users,
  FlaskConical,
  FileCheck,
  IdCard,
  MapPin,
} from "lucide-react";
import type { GeneratedProductProfileReport } from "../../../types/generatedProductProfile";
import { sortReportSectionsForDisplay } from "../../../utils/productProfileSectionDisplayOrder";
import "./GeneratedProductProfileCards.css";

const SECTION_ICONS: Record<number, React.ReactNode> = {
  1: <Package size={24} aria-hidden />,
  2: <IdCard size={24} aria-hidden />,
  3: <Cpu size={24} aria-hidden />,
  4: <Brain size={24} aria-hidden />,
  5: <Lock size={24} aria-hidden />,
  6: <Database size={24} aria-hidden />,
  7: <Award size={24} aria-hidden />,
  8: <Phone size={24} aria-hidden />,
  9: <Users size={24} aria-hidden />,
  10: <FlaskConical size={24} aria-hidden />,
  11: <FileCheck size={24} aria-hidden />,
  12: <MapPin size={24} aria-hidden />,
};

const SECTION_ICON_CLASS: Record<number, string> = {
  1: "generated_profile_icon_blue",
  2: "generated_profile_icon_blue",
  3: "generated_profile_icon_purple",
  4: "generated_profile_icon_purple",
  5: "generated_profile_icon_blue",
  6: "generated_profile_icon_orange",
  7: "generated_profile_icon_green",
  8: "generated_profile_icon_teal",
  9: "generated_profile_icon_red",
  10: "generated_profile_icon_orange",
  11: "generated_profile_icon_green",
  12: "generated_profile_icon_teal",
};

/** Default subtitles per section to match reference UI when report omits subtitle */
const SECTION_SUBTITLES: Record<number, string> = {
  1: "Product details, deployment, and market positioning.",
  2: "Vendor type and how you present your company.",
  3: "Model architecture, training, and oversight.",
  4: "Ethics, oversight, and governance practices.",
  5: "Security controls and infrastructure.",
  6: "Data handling, privacy, and retention.",
  7: "Regulatory frameworks and audit status.",
  8: "SLAs, support coverage, and change management.",
  9: "Critical vendors and supply chain.",
  10: "Transparency, explainability, and training-data posture.",
  11: "Telemetry, audit logs, and evidence availability.",
  12: "Team size, headquarters, and markets you serve.",
};

export interface SectionVisibilityControl {
  visible: boolean;
  onToggle: (value: boolean) => void;
}

/** Remove trailing "---", "--", or " -" from summary text for display. */
function summaryForDisplay(summary: string | null | undefined): string {
  if (!summary || typeof summary !== "string") return "";
  return summary.replace(/\s*-+\s*$/, "").trim();
}

/** Section 4 (AI governance / ethics): show "Human Oversight" instead of "Human-in-the-Loop" style labels. */
function displayLabelForGovernanceItem(label: string): string {
  const t = String(label ?? "").trim();
  if (/human[-\s]?in[-\s]?the[-\s]?loop/i.test(t)) return "Human Oversight";
  return label;
}

/** Section 3 (AI models & technology): omit duplicate Human Oversight row (shown under governance). */
function shouldOmitHumanOversightFromModelSection(sectionId: number, label: string): boolean {
  if (sectionId !== 3) return false;
  return /^human\s*oversight$/i.test(String(label ?? "").trim());
}

/** Operations & Support: hide legacy "Change Management" row; keep new release-cadence field label. */
function shouldOmitLegacyOperationsRow(sectionId: number, label: string): boolean {
  if (sectionId !== 8) return false;
  return /^change\s*management$/i.test(String(label ?? "").trim());
}

function pickSectionField(
  items: Record<string, string>,
  hints: string[],
  usedValues: Set<string>,
): string | null {
  for (const [label, value] of Object.entries(items)) {
    const key = label.toLowerCase();
    const normalizedValue = (value ?? "").trim();
    if (!normalizedValue) continue;
    if (!hints.some((h) => key.includes(h))) continue;
    const dupKey = normalizedValue.toLowerCase();
    if (usedValues.has(dupKey)) continue;
    usedValues.add(dupKey);
    return normalizedValue;
  }
  return null;
}

/** Same as pickSectionField but returns the report label (e.g. dynamic maturity question). */
function pickSectionEntry(
  items: Record<string, string>,
  hints: string[],
  usedValues: Set<string>,
): { label: string; value: string } | null {
  for (const [label, value] of Object.entries(items)) {
    const key = label.toLowerCase();
    const normalizedValue = (value ?? "").trim();
    if (!normalizedValue) continue;
    if (!hints.some((h) => key.includes(h))) continue;
    const dupKey = normalizedValue.toLowerCase();
    if (usedValues.has(dupKey)) continue;
    usedValues.add(dupKey);
    return { label, value: normalizedValue };
  }
  return null;
}

function pickAtGlanceValue(
  sections: GeneratedProductProfileReport["sections"],
  hints: string[],
): string {
  for (const sec of sections) {
    for (const [label, value] of Object.entries(sec.items)) {
      const key = label.toLowerCase();
      if (hints.some((h) => key.includes(h)) && value.trim()) return value.trim();
    }
  }
  return "—";
}

function pickValueAcrossSections(
  sections: GeneratedProductProfileReport["sections"],
  hints: string[],
  usedValues?: Set<string>,
): string | null {
  for (const sec of sections) {
    for (const [label, value] of Object.entries(sec.items)) {
      const key = label.toLowerCase();
      const normalizedValue = (value ?? "").trim();
      if (!normalizedValue) continue;
      if (!hints.some((h) => key.includes(h))) continue;
      const dedupeKey = normalizedValue.toLowerCase();
      if (usedValues && usedValues.has(dedupeKey)) continue;
      if (usedValues) usedValues.add(dedupeKey);
      return normalizedValue;
    }
  }
  return null;
}

function pickAtGlanceIndustries(
  sections: GeneratedProductProfileReport["sections"],
): string[] {
  const toTitle = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  const toChipTitle = (s: string) =>
    toTitle(s)
      .replace(/\bAi\b/g, "AI")
      .replace(/\bApi\b/g, "API")
      .replace(/\bGdpr\b/g, "GDPR")
      .replace(/\bHipaa\b/g, "HIPAA")
      .replace(/\bSoc2\b/g, "SOC2");
  const cleanIndustryText = (raw: string) =>
    raw
      .toLowerCase()
      .replace(/\bregulated industries?\b/g, "regulated industries")
      .replace(/\bsingle sector\b/g, " ")
      .replace(/\btarget industries?\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const splitIndustryTokens = (raw: string): string[] => {
    const cleaned = cleanIndustryText(raw);
    if (!cleaned) return [];
    const regulatedParen = cleaned.match(/regulated industries?\s*\(([^)]+)\)/i);
    if (regulatedParen && regulatedParen[1]) {
      return [toChipTitle(`regulated industries (${regulatedParen[1].trim()})`)];
    }
    const hasDelimiter = /[,;|•]/.test(cleaned);
    const baseParts = hasDelimiter
      ? cleaned.split(/\s*(?:,|;|\||•)\s*/)
      : cleaned.split(/\s+/);
    return baseParts
      .map((x) => x.trim())
      .filter(Boolean)
      .map(toChipTitle);
  };

  for (const sec of sections) {
    for (const [label, value] of Object.entries(sec.items)) {
      const key = label.toLowerCase();
      if ((key.includes("industry") || key.includes("sector")) && value.trim()) {
        const tokens = splitIndustryTokens(value);
        const deduped = Array.from(new Set(tokens));
        return deduped.slice(0, 4);
      }
    }
  }
  return [];
}

export interface GeneratedProductProfileCardsProps {
  report: GeneratedProductProfileReport;
  /** When set, each section card (not Trust Score) can show a "Visible to buyers" toggle. */
  sectionVisibility?: (sectionId: number) => SectionVisibilityControl | null;
  /** Show right-side "AT A Glance" card next to trust summary. */
  showAtAGlance?: boolean;
  /** Full-width block after product information (section id 1), before other sections. */
  afterProductInformation?: ReactNode;
}

function GeneratedProductProfileCards({
  report,
  sectionVisibility,
  showAtAGlance = false,
  afterProductInformation,
}: GeneratedProductProfileCardsProps) {
  const { trustScore, sections } = report;
  const orderedSections = useMemo(() => sortReportSectionsForDisplay(sections), [sections]);
  const hasProductInformationSection = sections.some((s) => s.id === 1);
  const scoreValue =
    typeof trustScore.overallScore === "number" && Number.isFinite(trustScore.overallScore)
      ? Math.max(0, Math.min(100, Math.round(trustScore.overallScore)))
      : null;
  const scoreNumber = scoreValue != null ? `${scoreValue}%` : "—";
  const atAGlance = useMemo(() => {
    const pricing = pickAtGlanceValue(sections, ["pricing", "price", "commercial"]);
    const version = pickAtGlanceValue(sections, ["version", "release"]);
    const employees = pickAtGlanceValue(sections, ["employee", "headcount", "team size"]);
    const founded = pickAtGlanceValue(sections, ["founded", "year founded"]);
    const industries = pickAtGlanceIndustries(sections);
    return { pricing, version, employees, founded, industries };
  }, [sections]);

  return (
    <div className="generated_profile_wrap">
      {/* Trust Score on top – number then label (match reference: large green number, "Trust Score" below) */}
      <section className="generated_profile_trust_section" aria-label="Trust Score">
        <div
          className={`generated_profile_trust_cards${showAtAGlance ? " generated_profile_trust_cards--with_glance" : ""}`}
        >
          <div className="generated_profile_trust_card generated_profile_trust_main">
            <div className="generated_profile_trust_ring_wrap">
              <div
                className="generated_profile_trust_ring"
                style={{ "--trust-score": `${scoreValue ?? 0}` } as CSSProperties}
                aria-label={scoreValue != null ? `Overall trust score ${scoreValue}%` : "Overall trust score not available"}
              >
                <div className="generated_profile_trust_ring_inner">
                  <span className="generated_profile_trust_ring_value">{scoreNumber}</span>
                  <span className="generated_profile_trust_ring_label">OVERALL</span>
                </div>
              </div>
            </div>
            <div className="generated_profile_trust_summary_block">
              <p className="generated_profile_trust_heading">Trust Score Summary</p>
              <p className="generated_profile_trust_summary">
                {trustScore.summary && trustScore.summary.trim() ? summaryForDisplay(trustScore.summary) : "—"}
              </p>
            </div>
          </div>
          {showAtAGlance && (
            <aside className="generated_profile_trust_card generated_profile_trust_glance" aria-label="At a glance">
              <p className="generated_profile_glance_title">AT A GLANCE</p>
              <div className="generated_profile_glance_grid">
                <div><span className="generated_profile_glance_k">Pricing</span><span className="generated_profile_glance_v">{atAGlance.pricing}</span></div>
                <div><span className="generated_profile_glance_k">Version</span><span className="generated_profile_glance_v">{atAGlance.version}</span></div>
                <div><span className="generated_profile_glance_k">Employees</span><span className="generated_profile_glance_v">{atAGlance.employees}</span></div>
                <div><span className="generated_profile_glance_k">Founded</span><span className="generated_profile_glance_v">{atAGlance.founded}</span></div>
              </div>
              {atAGlance.industries.length > 0 && (
                <div className="generated_profile_glance_industries">
                  <span className="generated_profile_glance_k">Target Industry</span>
                  <div className="generated_profile_glance_chip_row">
                    {atAGlance.industries.map((x) => (
                      <span key={x} className="generated_profile_glance_chip">{x}</span>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </section>

      {/* Section cards – each can have a "Visible to buyers" toggle when sectionVisibility is provided */}
      <section className="generated_profile_sections" aria-label="Product profile details">
        <div className="generated_profile_sections_grid">
          {orderedSections.map((sec) => {
            const icon = SECTION_ICONS[sec.id];
            const iconClass = SECTION_ICON_CLASS[sec.id] ?? "generated_profile_icon_default";
            const subtitle = sec.subtitle ?? SECTION_SUBTITLES[sec.id];
            const visibility = sectionVisibility?.(sec.id);
            return (
              <Fragment key={sec.id}>
              <div
                className="generated_profile_section_card"
                data-section-id={sec.id}
              >
                <div className="generated_profile_section_header">
                  <div className="icon_header_product_data">
<span className={`generated_profile_section_icon ${iconClass}`} aria-hidden>
                    {icon ?? <Package size={24} aria-hidden />}
                  </span>
                  <div className="generated_profile_section_header_text">
                    <h3 className="generated_profile_section_title">{sec.title}</h3>
                    {subtitle && (
                      <p className="generated_profile_section_subtitle">{subtitle}</p>
                    )}
                  </div>
                  </div>
                  
                  {visibility && (
                    <div className="generated_profile_section_toggle">
                      <button
                        type="button"
                        className="product_profile_toggle product_profile_product_toggle"
                        aria-pressed={visibility.visible}
                        onClick={() => visibility.onToggle(!visibility.visible)}
                        aria-label={`Toggle ${sec.title} visible to buyers`}
                      />
                      <span className="generated_profile_section_toggle_label">Visible to buyers</span>
                    </div>
                  )}
                </div>
                {sec.id === 1 ? (() => {
                  const used = new Set<string>();
                  const productName = pickSectionField(sec.items, ["product name"], used);
                  const hostedDeployed = pickSectionField(
                    sec.items,
                    ["how is your solution hosted", "solution hosted / deployed"],
                    used,
                  );
                  const deploymentScale = pickSectionField(
                    sec.items,
                    ["typical deployment scale", "deployment scale"],
                    used,
                  );
                  const maturityEntry = pickSectionEntry(sec.items, ["maturity stage"], used);
                  const primaryUseCase = pickSectionField(sec.items, ["primary use case", "use case", "purpose"], used);
                  const deploymentModel = pickSectionField(sec.items, ["deployment model"], used);
                  const legalName = pickSectionField(sec.items, ["legal name", "company legal", "entity"], used);
                  const headquarters =
                    pickSectionField(sec.items, ["headquarter", "headquarters", "headquarter location", "headquarters location"], used) ??
                    pickValueAcrossSections(
                      sections,
                      ["headquarter", "headquarters", "headquarter location", "headquarters location"],
                      used,
                    );
                  const fallbackPairs = Object.entries(sec.items)
                    .map(([label, value]) => [label, (value ?? "").trim()] as const)
                    .filter(([, value]) => value)
                    .filter(([, value]) => {
                      const key = value.toLowerCase();
                      if (used.has(key)) return false;
                      used.add(key);
                      return true;
                    });
                  const hasAnyProductInfoHighlight =
                    Boolean(productName) ||
                    Boolean(hostedDeployed) ||
                    Boolean(deploymentScale) ||
                    Boolean(maturityEntry) ||
                    Boolean(primaryUseCase) ||
                    Boolean(deploymentModel) ||
                    Boolean(legalName) ||
                    Boolean(headquarters);
                  return (
                    <div className="generated_profile_product_info">
                      {productName && (
                        <div className="generated_profile_product_info_row">
                          <p className="generated_profile_product_info_k">Product Name</p>
                          <p className="generated_profile_product_info_v">{productName}</p>
                        </div>
                      )}
                      {hostedDeployed && (
                        <div className="generated_profile_product_info_row">
                          <p className="generated_profile_product_info_k">
                            How is your solution hosted / deployed?
                          </p>
                          <p className="generated_profile_product_info_v">{hostedDeployed}</p>
                        </div>
                      )}
                      {deploymentScale && (
                        <div className="generated_profile_product_info_row">
                          <p className="generated_profile_product_info_k">
                            What is your typical deployment scale?
                          </p>
                          <p className="generated_profile_product_info_v">{deploymentScale}</p>
                        </div>
                      )}
                      {maturityEntry && (
                        <div className="generated_profile_product_info_row">
                          <p className="generated_profile_product_info_k">{maturityEntry.label}</p>
                          <p className="generated_profile_product_info_v">{maturityEntry.value}</p>
                        </div>
                      )}
                      {primaryUseCase && (
                        <div className="generated_profile_product_info_use_case">
                          <p className="generated_profile_product_info_k">Primary Use Case</p>
                          <p className="generated_profile_product_info_use_case_v">{primaryUseCase}</p>
                        </div>
                      )}
                      {deploymentModel && (
                        <div className="generated_profile_product_info_row">
                          <p className="generated_profile_product_info_k">Deployment Model</p>
                          <p className="generated_profile_product_info_v">{deploymentModel}</p>
                        </div>
                      )}
                      {legalName && (
                        <div className="generated_profile_product_info_row">
                          <p className="generated_profile_product_info_k">Legal Name</p>
                          <p className="generated_profile_product_info_v">{legalName}</p>
                        </div>
                      )}
                      {headquarters && (
                        <div className="generated_profile_product_info_row">
                          <p className="generated_profile_product_info_k">Headquarters</p>
                          <p className="generated_profile_product_info_v">{headquarters}</p>
                        </div>
                      )}
                      {!hasAnyProductInfoHighlight && (
                        <ul className="generated_profile_section_list">
                          {fallbackPairs.map(([label, value]) => (
                            <li key={label} className="generated_profile_section_item">
                              <span className="generated_profile_section_item_label">{label}:</span>{" "}
                              <span className="generated_profile_section_item_value">{value}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })() : (
                  (() => {
                    const seenValues = new Set<string>();
                    const cleanItems = Object.entries(sec.items)
                      .filter(([label]) => {
                        if (shouldOmitHumanOversightFromModelSection(sec.id, label)) return false;
                        if (shouldOmitLegacyOperationsRow(sec.id, label)) return false;
                        return true;
                      })
                      .filter(([, value]) => {
                        const v = (value ?? "").trim();
                        if (!v) return false;
                        const key = v.toLowerCase();
                        if (seenValues.has(key)) return false;
                        seenValues.add(key);
                        return true;
                      });
                    return (
                      <div className="generated_profile_product_info generated_profile_product_info--all_sections">
                        {cleanItems.map(([label, value]) => {
                          const displayLabel =
                            sec.id === 4 ? displayLabelForGovernanceItem(label) : label;
                          return (
                            <div key={label} className="generated_profile_product_info_row">
                              <p className="generated_profile_product_info_k">{displayLabel}</p>
                              <p className="generated_profile_product_info_v">{value}</p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
              {afterProductInformation && sec.id === 1 ? afterProductInformation : null}
              </Fragment>
            );
          })}
          {afterProductInformation && !hasProductInformationSection ? afterProductInformation : null}
        </div>
      </section>
    </div>
  );
}

export default GeneratedProductProfileCards;

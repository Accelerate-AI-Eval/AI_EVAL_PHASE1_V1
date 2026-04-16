import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BotIcon,
  FileCheck,
  FileText,
  FileWarning,
  Lightbulb,
  Loader2,
  MessageSquare,
  Send,
  Square,
  Swords,
  Target,
  TrendingDown,
  TrendingUp,
  TrendingUpDown,
  TriangleAlert,
  User,
} from "lucide-react";
import Select from "../../UI/Select";
import Input from "../../UI/Input";
import Button from "../../UI/Button";
import ChatMessage from "../../UI/ChatMessage";
import ClickTooltip from "../../UI/ClickTooltip";
import "../UserManagement/user_management.css";
import "./sales_enablement.css";

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

interface AssessmentRow {
  assessmentId: number;
  type: string;
  status: string;
  organizationId?: string | null;
  productName?: string | null;
  vendorProductName?: string | null;
  vendorName?: string | null;
  customerOrganizationName?: string | null;
  customerSector?: string | null;
  product_in_scope?: string | null;
  productInScope?: string | null;
  expiryAt?: string | null;
  /** When in the past, linked attestation is expired (exclude from dropdown). */
  attestationExpiryAt?: string | null;
  [key: string]: unknown;
}

interface SwotData {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
}

interface BattleCardQa {
  question: string;
  answer: string;
}

interface BattleCardData {
  title: string;
  keyDifferentiators?: string[];
  complianceHighlights?: string[];
  objectionHandling?: { question: string; answer: string };
  qaBlocks?: BattleCardQa[];
  idealCustomerProfile?: string;
  /** Legacy: simple bullets if new fields not provided */
  bullets?: string[];
}

interface ChatMessageItem {
  role: "agent" | "user";
  text?: string;
  swot?: SwotData;
  battleCard?: BattleCardData;
}

/** Dropdown label: "Org Name - Product Name" (customer org + attestation product name) */
function getSalesAgentAssessmentLabel(a: AssessmentRow): string {
  const orgName = (a.customerOrganizationName ?? "").toString().trim();
  const productName = (a.vendorProductName ?? a.productName ?? "").toString().trim();
  if (orgName && productName) return `${orgName} - ${productName}`;
  if (productName) return productName;
  if (orgName) return orgName;
  return `Vendor assessment #${a.assessmentId}`;
}

function isAssessmentExpired(row: AssessmentRow): boolean {
  const expiryAt = row.expiryAt;
  if (expiryAt == null || String(expiryAt).trim() === "") return false;
  const expiry = new Date(expiryAt);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() < today.getTime();
}

/** True when the linked attestation has an expiry date and it has passed. */
function isAttestationExpired(row: AssessmentRow): boolean {
  const attestationExpiryAt = row?.attestationExpiryAt;
  if (attestationExpiryAt == null || String(attestationExpiryAt).trim() === "") return false;
  try {
    const expiry = new Date(attestationExpiryAt);
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  } catch {
    return false;
  }
}

const GREETING =
  "Hello! I'm your AI Sales Enablement Agent. Select a vendor assessment from your completed evaluations and I can help you with SWOT analysis, battle card generation, or answer questions about their compliance posture.";

const QUICK_ACTIONS = [
  { label: "Generate SWOT Analysis", icon: BarChart3, key: "swot" as const },
  { label: "Create Battle Card", icon: Swords, key: "battlecard" as const },
  // { label: "View Sales Reports & Briefs", icon: FileText, key: "reports" as const },
];

const EXAMPLE_QUESTIONS = [
  "How should I address buyer concerns about data security and compliance?",
  "What compliance certifications can I highlight to this customer?",
  "How do I handle objections about AI risk from buyers?",
];

const SWOT_QUESTION = "Generate a SWOT analysis for my sales positioning.";
const BATTLE_CARD_QUESTION = "Create a battle card for my sales positioning.";

/** Detect if user is asking for SWOT (natural language: "swot", "swot analysis", etc.) */
function isSwotRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  if (lower.includes("swot") && lower.includes("analysis")) return true;
  if (/\bswot\b/.test(lower)) return true;
  return false;
}

/** Detect if user is asking for Battle Card (natural language: "battle card", "battlecard", etc.) */
function isBattleCardRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (!lower) return false;
  if (/\bbattle\s*card\b/.test(lower)) return true;
  if (/\bbattlecard\b/.test(lower)) return true;
  return false;
}

function hasSwotData(d: SwotData | null | undefined): boolean {
  return !!(
    d &&
    (d.strengths?.length > 0 ||
      d.weaknesses?.length > 0 ||
      d.opportunities?.length > 0 ||
      d.threats?.length > 0)
  );
}

function hasBattleCardData(d: BattleCardData | null | undefined): boolean {
  return !!(d && (d.title || d.keyDifferentiators?.length || d.complianceHighlights?.length));
}

export function SalesEnablement() {
  useEffect(() => {
    document.title = "AI-Q | Sales Agent";
  }, []);
  const [assessmentsList, setAssessmentsList] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const pendingAgentMessageRef = useRef<ChatMessageItem | null>(null);
  /** Cached SWOT and Battle Card for the selected assessment (after user clicks the button) */
  const [generatedSwot, setGeneratedSwot] = useState<SwotData | null>(null);
  const [generatedBattleCard, setGeneratedBattleCard] = useState<BattleCardData | null>(null);
  const [generatedForAssessmentId, setGeneratedForAssessmentId] = useState<string>("");

  const quickActionsEnabled = !!selectedAssessmentId;

  const fetchAssessments = useCallback(() => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setLoading(false);
      return;
    }
    const organizationId = sessionStorage.getItem("organizationId");
    const query = organizationId
      ? `?organizationId=${encodeURIComponent(organizationId)}`
      : "";
    fetch(`${BASE_URL}/assessments${query}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((result) => {
        if (result?.data?.assessments != null) {
          setAssessmentsList(result.data.assessments as AssessmentRow[]);
        } else {
          setAssessmentsList([]);
        }
      })
      .catch(() => setAssessmentsList([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  const completedVendorAssessments = assessmentsList.filter(
    (a) =>
      (a.type ?? "").toLowerCase() === "cots_vendor" &&
      (a.status ?? "").toLowerCase() !== "draft" &&
      !isAssessmentExpired(a) &&
      !isAttestationExpired(a),
  );

  const selectOptions = completedVendorAssessments.map((a) => ({
    value: String(a.assessmentId),
    label: getSalesAgentAssessmentLabel(a),
  }));

  useEffect(() => {
    if (
      selectedAssessmentId &&
      !completedVendorAssessments.some(
        (a) => String(a.assessmentId) === String(selectedAssessmentId),
      )
    ) {
      setSelectedAssessmentId("");
    }
  }, [selectedAssessmentId, completedVendorAssessments]);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedAssessmentId(value);
    if (value !== generatedForAssessmentId) {
      setGeneratedSwot(null);
      setGeneratedBattleCard(null);
      setGeneratedForAssessmentId("");
    }
  };

  const fetchSalesEnablement = useCallback(
    (
      assessmentId: string,
      type: "swot" | "battlecard"
    ): Promise<{ swot?: SwotData; battleCard?: BattleCardData } | null> => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token) return Promise.resolve(null);
      return fetch(`${BASE_URL}/salesEnablement`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assessmentId, type }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result?.success && result?.data) {
            return {
              swot: result.data.swot,
              battleCard: result.data.battleCard,
            };
          }
          throw new Error(result?.message ?? "Failed to generate");
        });
    },
    []
  );

  const fetchSalesAgentChat = useCallback(
    (assessmentId: string, question: string): Promise<string> => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token) return Promise.reject(new Error("Not authenticated"));
      return fetch(`${BASE_URL}/salesEnablement/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ assessmentId, question }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (result?.success && result?.data?.answer != null) {
            return String(result.data.answer);
          }
          throw new Error(result?.message ?? "Failed to get answer");
        });
    },
    []
  );

  const handleSend = () => {
    const text = messageInput.trim();
    if (!text || isGenerating) return;

    const isSwot = isSwotRequest(text);
    const isBattleCard = isBattleCardRequest(text);

    setMessages((prev) => [...prev, { role: "user", text }]);
    setMessageInput("");
    setIsGenerating(true);

    // User asked for SWOT (via NLP in textarea)
    if (isSwot) {
      if (!selectedAssessmentId) {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: "Please select a vendor assessment above, then ask again or click the SWOT Analysis button to generate from the complete report.",
          },
        ]);
        setIsGenerating(false);
        return;
      }
      if (hasSwotData(generatedSwot) && generatedForAssessmentId === selectedAssessmentId) {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: "Here's your sales positioning SWOT analysis - use these insights when engaging with prospects:",
            swot: generatedSwot!,
          },
        ]);
        setIsGenerating(false);
        return;
      }
      fetchSalesEnablement(selectedAssessmentId, "swot")
        .then((data) => {
          if (!data?.swot) return;
          setGeneratedSwot(data.swot);
          setGeneratedForAssessmentId(selectedAssessmentId);
          setMessages((prev) => [
            ...prev,
            {
              role: "agent" as const,
              text: "Here's your sales positioning SWOT analysis - use these insights when engaging with prospects:",
              swot: data.swot!,
            },
          ]);
        })
        .catch((err) => {
          setMessages((prev) => [
            ...prev,
            {
              role: "agent" as const,
              text: err?.message ?? "Failed to generate SWOT analysis. Please try again.",
            },
          ]);
        })
        .finally(() => setIsGenerating(false));
      return;
    }

    // User asked for Battle Card (via NLP in textarea)
    if (isBattleCard) {
      if (!selectedAssessmentId) {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: "Please select a vendor assessment above, then ask again or click the Battle Card button to generate from the complete report.",
          },
        ]);
        setIsGenerating(false);
        return;
      }
      if (hasBattleCardData(generatedBattleCard) && generatedForAssessmentId === selectedAssessmentId) {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: "Here's your battle card for sales conversations:",
            battleCard: generatedBattleCard!,
          },
        ]);
        setIsGenerating(false);
        return;
      }
      fetchSalesEnablement(selectedAssessmentId, "battlecard")
        .then((data) => {
          if (!data?.battleCard) return;
          setGeneratedBattleCard(data.battleCard);
          setGeneratedForAssessmentId(selectedAssessmentId);
          setMessages((prev) => [
            ...prev,
            {
              role: "agent" as const,
              text: "Here's your battle card for sales conversations:",
              battleCard: data.battleCard!,
            },
          ]);
        })
        .catch((err) => {
          setMessages((prev) => [
            ...prev,
            {
              role: "agent" as const,
              text: err?.message ?? "Failed to generate battle card. Please try again.",
            },
          ]);
        })
        .finally(() => setIsGenerating(false));
      return;
    }

    // General question about the selected assessment
    if (!selectedAssessmentId) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent" as const,
          text: "Please select a vendor assessment above to ask questions about it.",
        },
      ]);
      setIsGenerating(false);
      return;
    }

    fetchSalesAgentChat(selectedAssessmentId, text)
      .then((answer) => {
        setMessages((prev) => [
          ...prev,
          { role: "agent" as const, text: answer },
        ]);
      })
      .catch((err) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: err?.message ?? "Sorry, I couldn't answer that. Please try again.",
          },
        ]);
      })
      .finally(() => setIsGenerating(false));
  };

  const handleExampleClick = (question: string) => {
    setMessageInput(question);
  };

  function handleQuickActionSwot() {
    if (!quickActionsEnabled || isGenerating) return;
    setMessages((prev) => [...prev, { role: "user", text: SWOT_QUESTION }]);
    if (hasSwotData(generatedSwot) && generatedForAssessmentId === selectedAssessmentId) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent" as const,
          text: "Here's your sales positioning SWOT analysis - use these insights when engaging with prospects:",
          swot: generatedSwot!,
        },
      ]);
      return;
    }
    setIsGenerating(true);
    fetchSalesEnablement(selectedAssessmentId, "swot")
      .then((data) => {
        if (!data?.swot) return;
        setGeneratedSwot(data.swot);
        setGeneratedForAssessmentId(selectedAssessmentId);
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: "Here's your sales positioning SWOT analysis - use these insights when engaging with prospects:",
            swot: data.swot,
          },
        ]);
      })
      .catch((err) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: err?.message ?? "Failed to generate SWOT analysis. Please try again.",
          },
        ]);
      })
      .finally(() => setIsGenerating(false));
  }

  function handleQuickActionBattleCard() {
    if (!quickActionsEnabled || isGenerating) return;
    setMessages((prev) => [...prev, { role: "user", text: BATTLE_CARD_QUESTION }]);
    if (hasBattleCardData(generatedBattleCard) && generatedForAssessmentId === selectedAssessmentId) {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent" as const,
          text: "Here's your battle card for sales conversations:",
          battleCard: generatedBattleCard!,
        },
      ]);
      return;
    }
    setIsGenerating(true);
    fetchSalesEnablement(selectedAssessmentId, "battlecard")
      .then((data) => {
        if (!data?.battleCard) return;
        setGeneratedBattleCard(data.battleCard);
        setGeneratedForAssessmentId(selectedAssessmentId);
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: "Here's your battle card for sales conversations:",
            battleCard: data.battleCard,
          },
        ]);
      })
      .catch((err) => {
        setMessages((prev) => [
          ...prev,
          {
            role: "agent" as const,
            text: err?.message ?? "Failed to generate battle card. Please try again.",
          },
        ]);
      })
      .finally(() => setIsGenerating(false));
  }

  function handleQuickAction(key: string) {
    if (key === "swot") handleQuickActionSwot();
    else if (key === "battlecard") handleQuickActionBattleCard();
    // else if (key === "reports")
    //   setMessageInput("View sales reports and briefs");
  }

  return (
    <div className="sec_user_page org_settings_page sales_enablement_page">
      <div className="heading_user_page page_header_align">
        <div className="headers page_header_row">
          <span className="icon_size_header" aria-hidden>
            <BotIcon size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="page_header_title">Sales Enablement Agent</h1>
            <p className="sub_title page_header_subtitle">
              AI-powered sales assistance with SWOT analysis, battle cards, and
              Q&A.
            </p>
          </div>
        </div>
        <div className="btn_user_page sales_enablement_select_wrapper">
          <Select
            id="vendor_assessment"
            name="vendor_assessment"
            labelName=""
            value={selectedAssessmentId}
            default_option="Select a vendor assessment"
            options={selectOptions}
            onChange={handleSelectChange}
          />
        </div>
      </div>

      <div className="sales_enablement_section">
        <div className="sales_enablement_chat_layout">
          <div className="sales_enablement_chat_main">
            <div className="sales_enablement_chat_header">
              <div className="chat_message_header">
                <span className="chat_message_icon">
                  <BotIcon size={18} />
                </span>
                <div>
                  <span className="chat_message_title">AI Sales Assistant</span>
                  <p className="chat_message_subtitle">
                    Powered by vendor attestations & risk data.
                  </p>
                </div>
              </div>
            </div>
            <div className="sales_enablement_messages">
              <div className="chat_message chat_message--agent">
                <div className="bot_answer_sec sales_enablement_greeting_sec">
                  <span className="chat_message_icon"><BotIcon size={18} /></span>
                  <p>{GREETING}</p>
                </div>
              </div>
              {messages.map((msg, i) => (
                <ChatMessage
                  key={i}
                  role={msg.role}
                  icon={msg.role === "user" ? <User size={20} /> : undefined}
                >
                  {msg.role === "agent" && msg.swot ? (
                    <>
                      <div className="sales_enablement_agent_answer_wrap">
                        <span className="chat_message_icon sales_enablement_agent_icon">
                          <BotIcon size={18} />
                        </span>
                        <div className="bot_answer_sec">
                          {msg.text && (
                            <p className="sales_enablement_agent_intro">
                              {msg.text}
                            </p>
                          )}
                          <div className="sales_enablement_swot">
                            <div className="sales_enablement_swot_block sales_enablement_swot--strengths">
                              <div className="sales_enablement_swot_title">
                                <span>
                                  <TrendingUp className="swot_title_icons" />
                                </span>
                                <span>Strengths</span>
                              </div>
                              <ul>
                                {msg.swot.strengths.map((s, j) => (
                                  <li key={j}>{s}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="sales_enablement_swot_block sales_enablement_swot--weaknesses">
                              <div className="sales_enablement_swot_title">
                                <span><TrendingDown className="swot_title_icons"/></span>
                                <span>Weaknesses</span>
                              </div>
                              <ul>
                                {msg.swot.weaknesses.map((s, j) => (
                                  <li key={j}>{s}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="sales_enablement_swot_block sales_enablement_swot--opportunities">
                              <div className="sales_enablement_swot_title">
                                <span>
                                  <Lightbulb className="swot_title_icons" />
                                </span>
                                <span>Opportunities</span>
                              </div>
                              <ul>
                                {msg.swot.opportunities.map((s, j) => (
                                  <li key={j}>{s}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="sales_enablement_swot_block sales_enablement_swot--threats">
                              <div className="sales_enablement_swot_title">
                                <span>
                                  <TriangleAlert className="swot_title_icons" />
                                 
                                </span>
                                Threats
                              </div>
                              <ul>
                                {msg.swot.threats.map((s, j) => (
                                  <li key={j}>{s}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : msg.role === "agent" && msg.battleCard ? (
                    <div className="sales_enablement_agent_answer_wrap">
                      <span className="chat_message_icon sales_enablement_agent_icon">
                        <BotIcon size={18} />
                      </span>
                      <div className="bot_answer_sec">
                        {msg.text && (
                          <p className="sales_enablement_agent_intro">
                            {msg.text}
                          </p>
                        )}
                        <div className="sales_enablement_battle_card">
                          <h4 className="sales_enablement_battle_card_title">
                            {msg.battleCard.title}
                          </h4>
                          {(msg.battleCard.keyDifferentiators != null ||
                            msg.battleCard.complianceHighlights != null ||
                            msg.battleCard.objectionHandling != null) && (
                            <div className="sales_enablement_battle_card_grid">
                              {msg.battleCard.keyDifferentiators != null &&
                                msg.battleCard.keyDifferentiators.length > 0 && (
                                  <div className="sales_enablement_battle_card_section sales_enablement_battle_card--differentiators">
                                    <div className="sales_enablement_battle_card_section_header">
                                      <Target
                                        className="sales_enablement_battle_card_section_icon sales_enablement_battle_card_icon--blue"
                                        size={18}
                                        aria-hidden
                                      />
                                      <span>Key Differentiators</span>
                                    </div>
                                    <ul>
                                      {msg.battleCard.keyDifferentiators.map(
                                        (b, j) => (
                                          <li key={j}>{b}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                )}
                              {msg.battleCard.complianceHighlights != null &&
                                msg.battleCard.complianceHighlights.length >
                                  0 && (
                                  <div className="sales_enablement_battle_card_section sales_enablement_battle_card--compliance">
                                    <div className="sales_enablement_battle_card_section_header">
                                      <FileCheck
                                        className="sales_enablement_battle_card_section_icon sales_enablement_battle_card_icon--green"
                                        size={18}
                                        aria-hidden
                                      />
                                      <span>Compliance Highlights</span>
                                    </div>
                                    <ul className="sales_enablement_battle_card_highlights">
                                      {msg.battleCard.complianceHighlights.map(
                                        (b, j) => (
                                          <li key={j}>{b}</li>
                                        )
                                      )}
                                    </ul>
                                  </div>
                                )}
                              {msg.battleCard.objectionHandling != null && (
                                <div className="sales_enablement_battle_card_section sales_enablement_battle_card--objection">
                                  <div className="sales_enablement_battle_card_section_header">
                                    <Square
                                      className="sales_enablement_battle_card_section_icon sales_enablement_battle_card_icon--orange"
                                      size={18}
                                      aria-hidden
                                    />
                                    <span>Objection Handling</span>
                                  </div>
                                  <div className="sales_enablement_battle_card_qa">
                                    <p className="sales_enablement_battle_card_q">
                                      Q:{" "}
                                      {
                                        msg.battleCard.objectionHandling
                                          .question
                                      }
                                    </p>
                                    <p className="sales_enablement_battle_card_a">
                                      A:{" "}
                                      {
                                        msg.battleCard.objectionHandling
                                          .answer
                                      }
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {msg.battleCard.qaBlocks != null &&
                            msg.battleCard.qaBlocks.length > 0 && (
                              <div className="sales_enablement_battle_card_qa_blocks">
                                {msg.battleCard.qaBlocks.map((qa, j) => (
                                  <div
                                    key={j}
                                    className="sales_enablement_battle_card_qa_card"
                                  >
                                    <p className="sales_enablement_battle_card_q">
                                      Q: {qa.question}
                                    </p>
                                    <p className="sales_enablement_battle_card_a">
                                      A: {qa.answer}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          {msg.battleCard.idealCustomerProfile != null && (
                            <div className="sales_enablement_battle_card_icp">
                              <h5 className="sales_enablement_battle_card_icp_title">
                                Ideal Customer Profile
                              </h5>
                              <p>
                                {msg.battleCard.idealCustomerProfile}
                              </p>
                            </div>
                          )}
                          {msg.battleCard.bullets != null &&
                            msg.battleCard.bullets.length > 0 && (
                              <ul>
                                {msg.battleCard.bullets.map((b, j) => (
                                  <li key={j}>{b}</li>
                                ))}
                              </ul>
                            )}
                        </div>
                      </div>
                    </div>
                  ) : msg.role === "agent" ? (
                    <div className="sales_enablement_agent_answer_wrap">
                      <span className="chat_message_icon sales_enablement_agent_icon">
                        <BotIcon size={18} />
                      </span>
                      <div className="bot_answer_sec" style={msg.text && msg.text.length > 300 ? { whiteSpace: "pre-wrap" } : undefined}>
                        {msg.text}
                      </div>
                    </div>
                  ) : (
                    msg.text
                  )}
                </ChatMessage>
              ))}
              {isGenerating && (
                <div className="sales_enablement_loader_wrap">
                  <span className="chat_message_icon sales_enablement_agent_icon">
                    <BotIcon size={18} />
                  </span>
                  <Loader2 size={20} className="sales_enablement_loader_icon" aria-hidden />
                </div>
              )}
            </div>
            <div className="sales_enablement_input_row">
              <Input
                id="sales_enablement_message"
                labelName=""
                name="message"
                type="textarea"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                required={false}
                rows={3}
                placeholder="Ask how to address buyer concerns, handle objections, or position your solution..."
              />
              <Button
                type="button"
                className="sales_enablement_send_btn"
                onClick={handleSend}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 size={20} className="sales_enablement_send_loader" aria-hidden />
                ) : (
                  <Send size={20} aria-hidden />
                )}
              </Button>
            </div>
            <div className="sales_enablement_chat_actions">
              <button
                type="button"
                className="sales_enablement_chat_action_btn"
                disabled={!quickActionsEnabled || isGenerating}
                onClick={handleQuickActionSwot}
              >
                <BarChart3 size={16} aria-hidden />
                SWOT Analysis
              </button>
              <button
                type="button"
                className="sales_enablement_chat_action_btn"
                disabled={!quickActionsEnabled || isGenerating}
                onClick={handleQuickActionBattleCard}
              >
                <Swords size={16} aria-hidden />
                Battle Card
              </button>
            </div>
          </div>

          <aside className="sales_enablement_sidebar">
            <div className="sales_enablement_sidebar_card">
              <h3 className="sales_enablement_sidebar_title">Quick Actions</h3>
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                const isDisabled =
                  ((action.key === "swot" || action.key === "battlecard") && !quickActionsEnabled) ||
                  isGenerating;
                return (
                  <Button
                    key={action.label}
                    type="button"
                    className="sales_enablement_quick_action_btn"
                    disabled={isDisabled}
                    onClick={() => handleQuickAction(action.key)}
                  >
                    <Icon size={18} aria-hidden />
                    {action.label}
                  </Button>
                );
              })}
            </div>
            <div className="sales_enablement_sidebar_card">
              <h3 className="sales_enablement_sidebar_title">
                Example Questions
              </h3>
              <ul className="sales_enablement_example_list">
                {EXAMPLE_QUESTIONS.map((q, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="sales_enablement_example_btn"
                      onClick={() => handleExampleClick(q)}
                    >
                      <MessageSquare size={16} aria-hidden />
                      <ClickTooltip content={q} showOn="hover" position="top">
                        <span className="sales_enablement_example_btn_text">
                          {q}
                        </span>
                      </ClickTooltip>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

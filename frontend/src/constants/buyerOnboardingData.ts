import type { BuyerDataInterface } from "../types/formDataBuyer";
import type { PreviewSection } from "../types/preview";

export const BUYER_INDUSTRY_SECTORS = [
  {
    label: "Public Sector",
    options: [
      { label: "Federal Government (US)", value: "Federal Government (US)" },
      { label: "State Government (US)", value: "State Government (US)" },
      { label: "Local Government (US)", value: "Local Government (US)" },
      {
        label: "International Governments",
        value: "International Governments",
      },
      {
        label: "Educational Institutions (Public)",
        value: "Educational Institutions (Public)",
      },
      {
        label: "Public Healthcare Systems",
        value: "Public Healthcare Systems",
      },
      { label: "Public Utilities", value: "Public Utilities" },
      { label: "Defense & Military", value: "Defense & Military" },
      {
        label: "Law Enforcement & Emergency Services",
        value: "Law Enforcement & Emergency Services",
      },
    ],
  },
  {
    label: "Private Sector",
    options: [
      { label: "Healthcare", value: "Healthcare" },
      { label: "Finance & Banking", value: "Finance & Banking" },
      { label: "Insurance", value: "Insurance" },
      { label: "GovTech", value: "GovTech" },
      { label: "Manufacturing", value: "Manufacturing" },
      { label: "Retail & E-commerce", value: "Retail & E-commerce" },
      { label: "Technology & Software", value: "Technology & Software" },
      { label: "Telecommunications", value: "Telecommunications" },
      { label: "Energy & Utilities", value: "Energy & Utilities" },
      {
        label: "Transportation & Logistics",
        value: "Transportation & Logistics",
      },
      {
        label: "Real Estate & Construction",
        value: "Real Estate & Construction",
      },
      { label: "Professional Services", value: "Professional Services" },
      { label: "Media & Entertainment", value: "Media & Entertainment" },
      { label: "Hospitality & Tourism", value: "Hospitality & Tourism" },
      {
        label: "Agriculture & Food Production",
        value: "Agriculture & Food Production",
      },
      {
        label: "Pharmaceuticals & Biotechnology",
        value: "Pharmaceuticals & Biotechnology",
      },
      { label: "Automotive", value: "Automotive" },
      {
        label: "Aerospace & Defense (Private)",
        value: "Aerospace & Defense (Private)",
      },
      { label: "Chemical & Materials", value: "Chemical & Materials" },
      { label: "Consumer Goods", value: "Consumer Goods" },
      { label: "Unknown", value: "Unknown" },
    ],
  },
  {
    label: "Non-Profit",
    options: [
      {
        label: "Educational Institutions (Non-Profit)",
        value: "Educational Institutions (Non-Profit)",
      },
      { label: "Healthcare (Non-Profit)", value: "Healthcare (Non-Profit)" },
      { label: "Social Services", value: "Social Services" },
      { label: "Arts & Culture", value: "Arts & Culture" },
      {
        label: "Environmental & Conservation",
        value: "Environmental & Conservation",
      },
      {
        label: "International Development & Relief",
        value: "International Development & Relief",
      },
      { label: "Advocacy & Civil Rights", value: "Advocacy & Civil Rights" },
      { label: "Religious Organizations", value: "Religious Organizations" },
      { label: "Research & Think Tanks", value: "Research & Think Tanks" },
      {
        label: "Foundations & Grantmaking",
        value: "Foundations & Grantmaking",
      },
      { label: "Community Development", value: "Community Development" },
    ],
  },
];

export const BUYER_PRIMARY_ROLE = [
  {
    label: "Chief Executive Officer (CEO)",
    value: "Chief Executive Officer (CEO)",
  },
  {
    label: "Chief Operating Officer (COO)",
    value: "Chief Operating Officer (COO)",
  },
  {
    label: "Chief Technology Officer (CTO)",
    value: "Chief Technology Officer (CTO)",
  },
  {
    label: "Chief Information Officer (CIO)",
    value: "Chief Information Officer (CIO)",
  },
  { label: "Chief Data Officer (CDO)", value: "Chief Data Officer (CDO)" },
  {
    label: "VP of Technology/Engineering",
    value: "VP of Technology/Engineering",
  },
  { label: "VP of Operations", value: "VP of Operations" },
  { label: "VP of Product", value: "VP of Product" },
  { label: "Director of IT/Technology", value: "Director of IT/Technology" },
  { label: "Director of Data/Analytics", value: "Director of Data/Analytics" },
  { label: "Director of Operations", value: "Director of Operations" },
  { label: "Product Manager", value: "Product Manager" },
  { label: "Project Manager", value: "Project Manager" },
  { label: "IT Manager", value: "IT Manager" },
  { label: "Business Analyst", value: "Business Analyst" },
  { label: "Other", value: "Other" },
];

export const BUYER_DEPARTMENTS = [
  {
    label: "Information Technology (IT)",
    value: "Information Technology (IT)",
  },
  { label: "Data & Analytics", value: "Data & Analytics" },
  { label: "Operations", value: "Operations" },
  { label: "Product & Engineering", value: "Product & Engineering" },
  {
    label: "Clinical Operations (Healthcare)",
    value: "Clinical Operations (Healthcare)",
  },
  {
    label: "Claims Processing (Insurance)",
    value: "Claims Processing (Insurance)",
  },
  { label: "Customer Service", value: "Customer Service" },
  { label: "Marketing", value: "Marketing" },
  { label: "Sales", value: "Sales" },
  { label: "Finance", value: "Finance" },
  { label: "Human Resources", value: "Human Resources" },
  { label: "Legal & Compliance", value: "Legal & Compliance" },
  { label: "Risk Management", value: "Risk Management" },
  { label: "Research & Development", value: "Research & Development" },
  { label: "Business Operations", value: "Business Operations" },
  { label: "Multiple Departments", value: "Multiple Departments" },
  { label: "Other", value: "Other" },
];

export const BUYER_EMPLOYEE_COUNTS = [
  { label: "1-50", value: "1-50" },
  { label: "51-200", value: "51-200" },
  { label: "201-500", value: "201-500" },
  { label: "501-1,000", value: "501-1,000" },
  { label: "1,001-2,500", value: "1,001-2,500" },
  { label: "2,501-5,000", value: "2,501-5,000" },
  { label: "5,001-10,000", value: "5,001-10,000" },
  { label: "10,001-25,000", value: "10,001-25,000" },
  { label: "25,001-50,000", value: "25,001-50,000" },
  { label: "50,000+", value: "50,000+" },
];

export const BUYER_ANNUAL_REVENUE = [
  { label: "Less than $1M", value: "Less than $1M" },
  { label: "$1M - $10M", value: "$1M - $10M" },
  { label: "$10M - $50M", value: "$10M - $50M" },
  { label: "$50M - $100M", value: "$50M - $100M" },
  { label: "$100M - $500M", value: "$100M - $500M" },
  { label: "$500M - $1B", value: "$500M - $1B" },
  { label: "$1B - $5B", value: "$1B - $5B" },
  { label: "$5B - $10B", value: "$5B - $10B" },
  { label: "$10B+", value: "$10B+" },
  {
    label: "Not Applicable (Government/Non-Profit)",
    value: "Not Applicable (Government/Non-Profit)",
  },
];

export const BUYER_HEADQUARTERS_LOCATION = [
  { label: "United States", value: "United States" },
  { label: "Canada", value: "Canada" },
  { label: "United Kingdom", value: "United Kingdom" },
  { label: "Germany", value: "Germany" },
  { label: "France", value: "France" },
  { label: "Netherlands", value: "Netherlands" },
  { label: "Switzerland", value: "Switzerland" },
  { label: "Sweden", value: "Sweden" },
  { label: "Denmark", value: "Denmark" },
  { label: "Ireland", value: "Ireland" },
  { label: "Australia", value: "Australia" },
  { label: "Singapore", value: "Singapore" },
  { label: "Japan", value: "Japan" },
  { label: "South Korea", value: "South Korea" },
  { label: "India", value: "India" },
  { label: "Israel", value: "Israel" },
  { label: "China", value: "China" },
  { label: "UAE", value: "UAE" },
  { label: "Other (specify)", value: "Other (specify)" },
];

export const BUYER_OPERATING_REGIONS = [
  {
    label: "North America (US & Canada)",
    value: "North America (US & Canada)",
  },
  { label: "United States Only", value: "United States Only" },
  { label: "European Union", value: "European Union" },
  { label: "United Kingdom", value: "United Kingdom" },
  { label: "Europe (Non-EU)", value: "Europe (Non-EU)" },
  { label: "Asia-Pacific", value: "Asia-Pacific" },
  { label: "China", value: "China" },
  { label: "Middle East", value: "Middle East" },
  { label: "Africa", value: "Africa" },
  { label: "Latin America", value: "Latin America" },
  { label: "Global", value: "Global" },
];

/** Mutually exclusive with other entries in `BUYER_OPERATING_REGIONS` (see ChipMultiSelect `globalExclusiveValue`). */
export const BUYER_OPERATING_REGIONS_GLOBAL_VALUE = "Global";

export const BUYER_DATA_RESIDENCY_REQUIREMENTS = [
  { label: "No specific requirements", value: "No specific requirements" },
  {
    label: "Must remain in home country",
    value: "Must remain in home country",
  },
  { label: "EU (GDPR)", value: "EU (GDPR)" },
  { label: "United States", value: "United States" },
  { label: "United Kingdom", value: "United Kingdom" },
  { label: "China (localization law)", value: "China (localization law)" },
  { label: "Switzerland", value: "Switzerland" },
  { label: "Australia", value: "Australia" },
  { label: "Canada", value: "Canada" },
  {
    label: "Multi-region with restrictions",
    value: "Multi-region with restrictions",
  },
  {
    label: "Specific state/province requirements",
    value: "Specific state/province requirements",
  },
];

export const BUYER_EXISTING_AI_INITIATIVES = [
  { label: "No AI usage currently", value: "No AI usage currently" },
  { label: "Exploring/Researching AI", value: "Exploring/Researching AI" },
  { label: "Pilot projects (1-2)", value: "Pilot projects (1-2)" },
  {
    label: "Limited production deployment (3-5 AI systems)",
    value: "Limited production deployment (3-5 AI systems)",
  },
  {
    label: "Moderate production deployment (6-10 AI systems)",
    value: "Moderate production deployment (6-10 AI systems)",
  },
  {
    label: "Extensive AI deployment (10+ AI systems)",
    value: "Extensive AI deployment (10+ AI systems)",
  },
  { label: "AI-native organization", value: "AI-native organization" },
];

export const BUYER_AI_GOVERNANCE_MATURITY = [
  {
    label: "None (No formal AI governance policies)",
    value: "None (No formal AI governance policies)",
  },
  {
    label: "Basic (Documented AI policies exist)",
    value: "Basic (Documented AI policies exist)",
  },
  {
    label: "Intermediate (AI policies with oversight committee)",
    value: "Intermediate (AI policies with oversight committee)",
  },
  {
    label: "Advanced (Comprehensive AI governance with board oversight)",
    value: "Advanced (Comprehensive AI governance with board oversight)",
  },
  {
    label: "Optimized (Data-driven AI governance culture)",
    value: "Optimized (Data-driven AI governance culture)",
  },
];

export const BUYER_DATA_GOVERNANCE_MATURITY = [
  {
    label: "Ad-hoc (Minimal or no formal data policies)",
    value: "Ad-hoc (Minimal or no formal data policies)",
  },
  {
    label: "Defined (Basic data policies documented)",
    value: "Defined (Basic data policies documented)",
  },
  {
    label: "Managed (Data policies enforced with monitoring)",
    value: "Managed (Data policies enforced with monitoring)",
  },
  {
    label: "Optimized (Comprehensive data governance program)",
    value: "Optimized (Comprehensive data governance program)",
  },
  {
    label: "Excellent (Industry-leading data governance)",
    value: "Excellent (Industry-leading data governance)",
  },
];

export const BUYER_AI_SKILLS_AVAILABILITY = [
  { label: "None (No AI/ML expertise)", value: "None (No AI/ML expertise)" },
  {
    label: "Limited (1-2 individuals with AI/ML skills)",
    value: "Limited (1-2 individuals with AI/ML skills)",
  },
  {
    label: "Moderate (3-5 person AI/ML team)",
    value: "Moderate (3-5 person AI/ML team)",
  },
  {
    label: "Strong (5-10 person AI/ML team)",
    value: "Strong (5-10 person AI/ML team)",
  },
  {
    label: "Expert (10+ person AI/ML team)",
    value: "Expert (10+ person AI/ML team)",
  },
];

export const BUYER_CHANGE_MANAGEMENT_CAPABILITY = [
  {
    label: "None (No formal change management)",
    value: "None (No formal change management)",
  },
  {
    label: "Ad-hoc (Informal change management)",
    value: "Ad-hoc (Informal change management)",
  },
  {
    label: "Basic (Documented change processes)",
    value: "Basic (Documented change processes)",
  },
  {
    label: "Intermediate (Structured change management program)",
    value: "Intermediate (Structured change management program)",
  },
  {
    label: "Advanced (Mature change management capability)",
    value: "Advanced (Mature change management capability)",
  },
  {
    label: "Excellent (Industry-leading change management)",
    value: "Excellent (Industry-leading change management)",
  },
];

export const BUYER_PRIMARY_REGULATORY_FRAMEWORKS = [
  { label: "None/Minimal regulation", value: "None/Minimal regulation" },
  { label: "HIPAA", value: "HIPAA" },
  { label: "HITRUST", value: "HITRUST" },
  { label: "FDA", value: "FDA" },
  {
    label: "GLBA (Gramm-Leach-Bliley Act)",
    value: "GLBA (Gramm-Leach-Bliley Act)",
  },
  { label: "PCI DSS", value: "PCI DSS" },
  { label: "SOX (Sarbanes-Oxley)", value: "SOX (Sarbanes-Oxley)" },
  { label: "GDPR", value: "GDPR" },
  { label: "CCPA/CPRA", value: "CCPA/CPRA" },
  { label: "FedRAMP", value: "FedRAMP" },
  { label: "StateRAMP", value: "StateRAMP" },
  { label: "NIST frameworks", value: "NIST frameworks" },
  { label: "ISO 27001", value: "ISO 27001" },
  { label: "SOC 2", value: "SOC 2" },
  {
    label: "Industry-specific regulations",
    value: "Industry-specific regulations",
  },
  { label: "Other", value: "Other" },
];

export const BUYER_REGULATORY_PENALTY_EXPOSURE = [
  { label: "Minimal (Less than $100K)", value: "Minimal (Less than $100K)" },
  { label: "Low ($100K - $1M)", value: "Low ($100K - $1M)" },
  { label: "Medium ($1M - $10M)", value: "Medium ($1M - $10M)" },
  { label: "High ($10M - $100M)", value: "High ($10M - $100M)" },
  { label: "Severe ($100M+)", value: "Severe ($100M+)" },
];

export const BUYER_DATA_CLASSIFICATION_LEVELS_HANDLED = [
  { label: "Public", value: "Public" },
  { label: "Internal/Confidential", value: "Internal/Confidential" },
  {
    label: "Confidential/Business-Sensitive",
    value: "Confidential/Business-Sensitive",
  },
  {
    label: "Restricted (PHI/PII/Financial)",
    value: "Restricted (PHI/PII/Financial)",
  },
  {
    label: "Regulated (Government/National Security)",
    value: "Regulated (Government/National Security)",
  },
];

export const BUYER_PII_SENSITIVE_DATA_HANDLING = [
  { label: "None (No PII handled)", value: "None (No PII handled)" },
  {
    label: "Minimal (Limited identifiers only)",
    value: "Minimal (Limited identifiers only)",
  },
  {
    label: "Moderate (Standard personal data)",
    value: "Moderate (Standard personal data)",
  },
  {
    label: "Extensive (Detailed personal profiles)",
    value: "Extensive (Detailed personal profiles)",
  },
  {
    label: "Critical (PHI/Financial data)",
    value: "Critical (PHI/Financial data)",
  },
  {
    label: "Highly Sensitive (Special category: biometric/genetic/health)",
    value: "Highly Sensitive (Special category: biometric/genetic/health)",
  },
];

export const BUYER_EXISTING_TECHNOLOGY_STACK = [
  { label: "Cloud (AWS)", value: "Cloud (AWS)" },
  { label: "Cloud (Azure)", value: "Cloud (Azure)" },
  {
    label: "Cloud (Google Cloud Platform)",
    value: "Cloud (Google Cloud Platform)",
  },
  { label: "Cloud (Other)", value: "Cloud (Other)" },
  { label: "On-Premises Infrastructure", value: "On-Premises Infrastructure" },
  { label: "Hybrid Cloud", value: "Hybrid Cloud" },
  { label: "Legacy Mainframe Systems", value: "Legacy Mainframe Systems" },
  {
    label: "Modern Microservices Architecture",
    value: "Modern Microservices Architecture",
  },
  { label: "Monolithic Applications", value: "Monolithic Applications" },
  { label: "SaaS Applications", value: "SaaS Applications" },
  { label: "Custom-Built Systems", value: "Custom-Built Systems" },
  { label: "Third-Party Integrations", value: "Third-Party Integrations" },
  { label: "API-First Architecture", value: "API-First Architecture" },
  { label: "Not Sure/Need Assessment", value: "Not Sure/Need Assessment" },
];

export const BUYER_AI_RISK_APPETITE = [
  {
    label: "Conservative (Minimize risk, extensive controls)",
    value: "Conservative (Minimize risk, extensive controls)",
  },
  {
    label: "Moderate (Balance risk and innovation)",
    value: "Moderate (Balance risk and innovation)",
  },
  {
    label: "Aggressive (Accept higher risk for faster innovation)",
    value: "Aggressive (Accept higher risk for faster innovation)",
  },
  {
    label: "Risk-Seeking (Pioneering, willing to accept significant risk)",
    value: "Risk-Seeking (Pioneering, willing to accept significant risk)",
  },
];

export const BUYER_ACCEPTABLE_RISK_LEVEL = [
  { label: "Very Low (0-25)", value: "Very Low (0-25)" },
  { label: "Low (26-40)", value: "Low (26-40)" },
  { label: "Medium (41-60)", value: "Medium (41-60)" },
  { label: "High (61-75)", value: "High (61-75)" },
  { label: "Very High (76-100)", value: "Very High (76-100)" },
];

export const BUYER_ORGANIZATION_TYPE = [
  {
    label: "Enterprise (5,000+ employees)",
    value: "Enterprise (5,000+ employees)",
  },
  {
    label: "Mid-Market Enterprise (1,000–5,000 employees)",
    value: "Mid-Market Enterprise (1,000–5,000 employees)",
  },
  {
    label: "Mid-Market (500–1,000 employees)",
    value: "Mid-Market (500–1,000 employees)",
  },
  {
    label: "Small-Medium Business (50–500 employees)",
    value: "Small-Medium Business (50–500 employees)",
  },
  {
    label: "Startup / Scale-up (<50 employees)",
    value: "Startup / Scale-up (<50 employees)",
  },
  { label: "Government – Federal", value: "Government – Federal" },
  { label: "Government – State / Local", value: "Government – State / Local" },
  { label: "Non-Profit Organization", value: "Non-Profit Organization" },
  {
    label: "Academic / Research Institution",
    value: "Academic / Research Institution",
  },
];

//HELPER TEXT FOR BUYER
export const BUYER_HELPTEXT = {
  organizationName:
    "Official name of your organization (e.g., HealthFirst Insurance Corp.)",
  organizationType:
    "Category that best describes your organization's size and type",
  sector:
    "Primary industry sector and applicable sub-sector(s); select at least one",
  organizationWebsite:
    "Primary website of your organization (e.g., https://yourcompany.com)",
  organizationDescription:
    "Brief description of your organization's mission, services, and primary business activities (max 500 characters)",
  primaryContactName:
    "Full name of the primary point of contact for this AI implementation project",
  primaryContactEmail:
    "Business email address of the primary contact (e.g., contact@organization.com)",
  primaryContactRole:
    "Role that best matches the primary contact's position in your organization",
  departmentOwner:
    "Primary department or business unit that will own and implement the AI solution",
  employeeCount:
    "Total number of employees in your organization, including full-time and FTEs",
  annualRevenue:
    "Approximate annual revenue of the organization (optional; used to assess budget capacity)",
  yearFounded:
    "Year the organization was founded or incorporated (optional; indicates organizational maturity)",
  headquartersLocation:
    "Country where the organization's headquarters is located",
  operatingRegions:
    "Geographic regions where the organization operates or serves customers",
  dataResidencyRequirements:
    "Applicable data residency or data localization requirements",
  existingAIInitiatives:
    "Description of current or past AI initiatives within the organization (optional)",
  aiGovernanceMaturity:
    "Current maturity level of AI governance within the organization",
  dataGovernanceMaturity: "Current maturity level of data governance practices",
  aiSkillsAvailability:
    "Availability and depth of internal AI/ML technical expertise",
  changeManagementCapability:
    "Organization’s maturity in managing change and adoption initiatives",
  primaryRegulatoryFrameworks:
    "Regulatory frameworks applicable to the organization",
  regulatoryPenaltyExposure:
    "Estimated potential regulatory penalties for non-compliance",
  dataClassificationHandled:
    "Data classification levels handled by the organization (e.g., public, confidential, restricted)",
  piiHandling:
    "Level and sensitivity of personally identifiable information handled",
  existingTechStack:
    "Technologies that describe the organization’s current IT infrastructure",
  aiRiskAppetite: "Organization’s tolerance for AI-related risk",
  acceptableRiskLevel:
    "Maximum acceptable AI risk score used as the decision threshold",
};

export const BUYER_PREVIEW_SECTIONS: PreviewSection<BuyerDataInterface>[] = [
  {
    /**
     * Company Profile section
     * This includes the core identity and basic details about the vendor organization,
     * such as type, maturity, industry sectors, and general company information.
     */
    title: "Organization Profile",
    fields: [
      { label: "Organization Name", value: (d) => d.organizationName },
      { label: "Organization Profile", value: (d) => d.organizationType },
      {
        label: "Industry Sectors",
        value: (data) => {
          if (!data.sector) return "N/A";

          const sectorMap: Record<string, string[] | undefined> = {
            "Public Sector": data.sector.public_sector,
            "Private Sector": data.sector.private_sector,
            "Non-Profit Sector": data.sector.non_profit_sector,
          };

          const selectedSectors: Record<string, string[]> = {};

          Object.entries(sectorMap).forEach(([label, values]) => {
            if (Array.isArray(values) && values.length > 0) {
              selectedSectors[label] = values;
            }
          });

          return Object.keys(selectedSectors).length ? selectedSectors : "N/A";
        },
      },

      { label: "Organization Website", value: (d) => d.organizationWebsite },

      {
        label: "Organization Description",
        value: (d) => d.organizationDescription,
      },
    ],
  },

  {
    title: "Contact Information",
    fields: [
      {
        label: "Primary Contact Name",
        value: (d) => d.primaryContactName,
      },
      {
        label: "Primary Contact Role",
        value: (d) => d.primaryContactRole,
      },
      {
        label: "Primary Contact Email",
        value: (d) => d.primaryContactEmail,
      },
      {
        label: "Department/Business Unit",
        value: (d) => d.departmentOwner,
      },
    ],
  },

  {
    title: "Organization Scale",
    fields: [
      { label: "Organization Size", value: (d) => d.employeeCount },
      { label: "Annual Revenue Range", value: (d) => d.annualRevenue },
      { label: "yearFounded", value: (d) => d.yearFounded },
    ],
  },


  {
    title: "Geography",
    fields: [
      {
        label: "Headquarters Location",
        value: (d) => d.headquartersLocation,
      },
      { label: "Operating Regions", value: (d) => d.operatingRegions },
      {
        label: "Data Residency Requirements",
        value: (d) => d.dataResidencyRequirements,
      },
    ],
  },

    {
    title: "Current AI Maturity",
    fields: [
      {
        label: "Existing AI Initiatives",
        value: (d) => d.existingAIInitiatives,
      },
      { label: "AI Governance Maturity", value: (d) => d.aiGovernanceMaturity },
      {
        label: "Data Governance Maturity",
        value: (d) => d.dataGovernanceMaturity,
      },
      {
        label: "AI Skills Availability",
        value: (d) => d.aiSkillsAvailability,
      },
      {
        label: "Change Management Capability",
        value: (d) => d.changeManagementCapability,
      },
    ],
  },
    {
    title: "Technical Environment",
    fields: [
      {
        label: "Existing Technology Stack",
        value: (d) => d.existingTechStack,
      },
     
    ],
  },
    {
    title: "Risk Appetite",
    fields: [
      {
        label: "AI Risk Appetite",
        value: (d) => d.aiRiskAppetite,
      },
      {
        label: "Acceptable Risk Level",
        value: (d) => d.acceptableRiskLevel,
      },
     
    ],
  },
];

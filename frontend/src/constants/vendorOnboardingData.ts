import type { PreviewSection, VendorFormData} from "../types/preview"; // types used in preview

export const EMPLOYEE_COUNTS = [
  { label: "1–10", value: "1–10" },
  { label: "11–50", value: "11–50" },
  { label: "51–200", value: "51–200" },
  { label: "201–500", value: "201–500" },
  { label: "501–1,000", value: "501–1,000" },
  { label: "1,001–5,000", value: "1,001–5,000" },
  { label: "5,001–10,000", value: "5,001–10,000" },
  { label: "10,000+", value: "10,000+" },
];

export const VENDOR_MATURITY_LEVELS = [
  {
    label: "Startup - Early-stage, innovative solutions",
    value: "Startup - Early-stage, innovative solutions",
  },
  {
    label: "Growth Stage - Scaling customer base",
    value: "Growth Stage - Scaling customer base",
  },
  {
    label: "Established - Proven track record",
    value: "Established - Proven track record",
  },
  {
    label: "Enterprise - Large-scale global operations",
    value: "Enterprise - Large-scale global operations",
  },
];

export const VENDOR_TYPES = [
  { label: "AI Product Company", value: "AI Product Company" },
  { label: "AI Platform Provider", value: "AI Platform Provider" },
  { label: "AI-Enabled SaaS", value: "AI-Enabled SaaS" },
  { label: "System Integrator", value: "System Integrator" },
  {
    label: "Technology Vendor with AI Features",
    value: "Technology Vendor with AI Features",
  },
];

export const INDUSTRY_SECTORS = [
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

export const VENDOR_MATURITY_STAGE = [
  { label: "Startup (Pre-Seed/Seed)", value: "Startup (Pre-Seed/Seed)" },
  { label: "Early Stage (Series A)", value: "Early Stage (Series A)" },
  { label: "Growth Stage (Series B/C)", value: "Growth Stage (Series B/C)" },
  {
    label: "Established (Series D+/Pre-IPO)",
    value: "Established (Series D+/Pre-IPO)",
  },
  { label: "Publicly Traded", value: "Publicly Traded" },
  { label: "Mature Private Company", value: "Mature Private Company" },
  { label: "Bootstrapped / Self-Funded", value: "Bootstrapped / Self-Funded" },
];

export const PRIMARY_CONTACT_ROLE = [
  {
    label: "Chief Executive Officer (CEO)",
    value: "Chief Executive Officer (CEO)",
  },
  {
    label: "Chief Technology Officer (CTO)",
    value: "Chief Technology Officer (CTO)",
  },
  {
    label: "Chief Product Officer (CPO)",
    value: "Chief Product Officer (CPO)",
  },
  { label: "VP Engineering", value: "VP Engineering" },
  { label: "VP Product", value: "VP Product" },
  { label: "VP Sales", value: "VP Sales" },
  { label: "Director of Engineering", value: "Director of Engineering" },
  { label: "Director of Product", value: "Director of Product" },
  { label: "Product Manager", value: "Product Manager" },
  { label: "Sales Executive", value: "Sales Executive" },
  { label: "Other", value: "Other" },
];

export const HEADQUARTERS_LOCATION = [
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
  { label: "Other (Specify)", value: "Other (Specify)" },
];

export const OPERATING_REGIONS = [
  { label: "North America", value: "North America" },
  { label: "Europe (EU)", value: "Europe (EU)" },
  { label: "Europe (Non-EU)", value: "Europe (Non-EU)" },
  { label: "United Kingdom", value: "United Kingdom" },
  { label: "Asia-Pacific", value: "Asia-Pacific" },
  { label: "Middle East", value: "Middle East" },
  { label: "Africa", value: "Africa" },
  { label: "Latin America", value: "Latin America" },
  { label: "Global (All regions)", value: "Global (All regions)" },
];

/** Mutually exclusive with other entries in `OPERATING_REGIONS` (see ChipMultiSelect `globalExclusiveValue`). */
export const VENDOR_OPERATING_REGIONS_GLOBAL_VALUE = "Global (All regions)";

// HELPER TEXT FOR VENDOR ONBOARDING
export const VENDOR_HELPTEXT = {
  vendorName:
    "Your company or vendor display name as it should appear in the platform",
  vendorType:
    "Select the category that best describes your primary business model",
  sector:
    "Select your primary industry sector (organized by Public Sector, Private Sector, and Non-Profit categories) and then select from the sub-set list",
  vendorMaturity:
    "Select the stage that best describes your company's current funding and maturity level",
  companyWebsite:
    "Your primary company website (e.g., https://yourcompany.com)",
  companyDescription:
    "Briefly describe your company's mission, primary products/services, and key differentiators (500 characters max)",
  primaryContactName:
    "Full name of the primary point of contact for this assessment",
  primaryContactEmail:
    "Business email address for the primary contact (e.g., contact@company.com)",
  primaryContactRole:
    "Select the role that best matches the primary contact's position",
  employeeCount:
    "Select the range that includes your total employee count (full-time and full-time equivalent)",
  yearFounded:
    "Select the year your company was officially founded or incorporated",
  headquartersLocation:
    "Select the country where your company's headquarters is located",
  operatingRegions:
    "Select all geographic regions where your company actively operates or serves customers",
};


export const VENDOR_PREVIEW_SECTIONS: PreviewSection<VendorFormData>[] = [
  {
    /**
     * Company Profile section
     * This includes the core identity and basic details about the vendor organization,
     * such as type, maturity, industry sectors, and general company information.
     */
    title: "Company Profile",
    fields: [
      { label: "Vendor Name", value: (d) => d.vendorName ?? "—" },
      { label: "Vendor Type", value: (d) => d.vendorType },

      /**
       * Industry Sectors
       * Dynamically includes only the selected sectors from public,
       * private, or non‑profit categories.
       */
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

          return Object.keys(selectedSectors).length
            ? selectedSectors
            : "N/A";
        },
      },

      { label: "Vendor Maturity", value: (d) => d.vendorMaturity },

      /**
       * Company Website
       * Rendered as a clickable link in the preview.
       */
      { label: "Company Website", value: (d) => d.companyWebsite },

      { label: "Company Description", value: (d) => d.companyDescription },

      /** Total number of employees */
      { label: "Employee Count", value: (d) => d.employeeCount },

      /** Founding year of the company */
      { label: "Year Founded", value: (d) => d.yearFounded },

      /** Main location of the company */
      { label: "Headquarters Location", value: (d) => d.headquartersLocation },

      /** Regions where the company operates */
      { label: "Operating Regions", value: (d) => d.operatingRegions },
    ],
  },

  {
    /**
     * Contact Information section
     * Contains the primary contact details for the vendor,
     * typically used for follow‑up, support, or communication.
     */
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
    ],
  },

  {
    /**
     * Company Scale section
     * Highlights quantitative aspects of the vendor business:
     * how large the company is and how long it has been operating.
     */
    title: "Company Scale",
    fields: [
      { label: "Employee Count", value: (d) => d.employeeCount },
      { label: "Year Founded", value: (d) => d.yearFounded },
    ],
  },

  {
    /**
     * Geography section
     * Captures where the company is based and the regions in
     * which it does significant business or has a presence.
     */
    title: "Geography",
    fields: [
      {
        label: "Headquarters Location",
        value: (d) => d.headquartersLocation,
      },
      { label: "Operating Regions", value: (d) => d.operatingRegions },
    ],
  },
];

/**
 * Buyer COTS Assessment form schema (aligned with Excel field spec V2 / v4).
 */
export type BuyerCotsInputType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "date"
  | "file"
  | "vendorProduct"
  | "targetOutcome"
  | "accountableOwner"
  | "assessor"
  | "integrationAccess"
  | "confirmDispute"
  | "industrySector"
  | "evidenceHold";

export interface BuyerCotsFieldConfig {
  key: string;
  label: string;
  placeholder: string;
  inputType: BuyerCotsInputType;
  optionsKey?: string;
  required: boolean;
  readOnly?: boolean;
  derived?: boolean;
  exclusiveValue?: string;
  showWhen?: { key: string; includes: string };
  stanceKey?: string;
  noteKey?: string;
  maxLength?: number;
}

export interface BuyerCotsSectionConfig {
  id: string;
  label: string;
  subTitle?: string;
  fields: BuyerCotsFieldConfig[];
}

export const BUYER_COTS_FORM_SECTIONS: BuyerCotsSectionConfig[] = [
  {
    id: "context",
    label: "Context",
    subTitle: "Prefilled from your organization record",
    fields: [
      {
        key: "organizationName",
        label: "Organization name",
        placeholder: "Example: Memorial Health System",
        inputType: "text",
        required: false,
        readOnly: true,
      },
      {
        key: "industrySector",
        label: "Industry sector",
        placeholder: "Pre-filled from onboarding",
        inputType: "industrySector",
        required: false,
        readOnly: true,
      },
      {
        key: "employeeCount",
        label: "Employee count",
        placeholder: "Select your total employee count range",
        inputType: "select",
        optionsKey: "employeeCount",
        required: false,
        readOnly: true,
      },
      {
        key: "operatingRegions",
        label: "Operating regions",
        placeholder: "Select all regions where you have operations or customers",
        inputType: "multiselect",
        optionsKey: "operatingRegions",
        required: false,
        readOnly: true,
        exclusiveValue: "Global",
      },
      {
        key: "riskAppetite",
        label: "Organisational AI risk appetite",
        placeholder: "Pre-filled from onboarding",
        inputType: "select",
        optionsKey: "riskAppetite",
        required: false,
        readOnly: true,
      },
    ],
  },
  {
    id: "purchase",
    label: "What are we buying and why",
    subTitle: "Vendor, use case, and success measures",
    fields: [
      {
        key: "vendorName",
        label: "Which vendor and product?",
        placeholder: "Choose from the AI Vendor Directory, or type a name if not listed",
        inputType: "vendorProduct",
        required: true,
      },
      {
        key: "useCaseTypes",
        label: "What will the AI actually do?",
        placeholder: "Select all that apply",
        inputType: "multiselect",
        optionsKey: "useCaseTypes",
        required: true,
      },
      {
        key: "businessPainPoint",
        label: "What problem are you solving?",
        placeholder:
          "Describe the problem in a few sentences. Example: Claims take 45 days on average and we need that under 10 days without losing accuracy.",
        inputType: "textarea",
        required: true,
      },
      {
        key: "targetOutcomeMetric",
        label: "What does success look like in year one?",
        placeholder: "Metric name, today's number, and year-one target",
        inputType: "targetOutcome",
        required: true,
        maxLength: 120,
      },
      {
        key: "usersInScope",
        label: "How many people will use it in year one?",
        placeholder: "Select the expected number of users",
        inputType: "select",
        optionsKey: "usersInScope",
        required: true,
      },
      {
        key: "budgetRange",
        label: "Budget for year one",
        placeholder: "Select your total implementation budget (first year)",
        inputType: "select",
        optionsKey: "budgetRange",
        required: true,
      },
      {
        key: "targetTimeline",
        label: "Target timeline",
        placeholder: "Select expected time from vendor selection to production",
        inputType: "select",
        optionsKey: "targetTimeline",
        required: true,
      },
      {
        key: "currentUsageState",
        label: "What is the current state of use?",
        placeholder: "Select the current state of use",
        inputType: "select",
        optionsKey: "currentUsageState",
        required: true,
      },
      {
        key: "pilotStatus",
        label: "Has a pilot run, and what happened?",
        placeholder: "Select the pilot status",
        inputType: "select",
        optionsKey: "pilotStatus",
        required: true,
      },
      {
        key: "owningDepartment",
        label: "Who owns this system and its output?",
        placeholder: "Department, named owner, and role",
        inputType: "accountableOwner",
        required: true,
      },
    ],
  },
  {
    id: "dataLegal",
    label: "Data and legal exposure",
    subTitle: "What data is involved and which rules apply",
    fields: [
      {
        key: "dataClasses",
        label: "What data will the AI see?",
        placeholder: "Select all data classes that apply",
        inputType: "multiselect",
        optionsKey: "dataClasses",
        required: true,
        exclusiveValue: "None of the above",
      },
      {
        key: "dataSensitivity",
        label: "Data sensitivity band",
        placeholder: "Derived from the data classes above",
        inputType: "select",
        optionsKey: "dataSensitivity",
        required: false,
        readOnly: true,
        derived: true,
      },
      {
        key: "dataSubjectJurisdictions",
        label: "Whose residents' data is involved?",
        placeholder: "Select all jurisdictions that apply",
        inputType: "multiselect",
        optionsKey: "dataSubjectJurisdictions",
        required: true,
        exclusiveValue: "No personal data",
      },
      {
        key: "decisionDomains",
        label: "Does the AI influence decisions about individuals?",
        placeholder: "Select all that apply",
        inputType: "multiselect",
        optionsKey: "decisionDomains",
        required: true,
        exclusiveValue: "None of these",
      },
      {
        key: "outputExposure",
        label: "Does the output leave the organisation?",
        placeholder: "Select how output is used",
        inputType: "select",
        optionsKey: "outputExposure",
        required: true,
      },
      {
        key: "regulatoryRequirements",
        label: "Which regulatory requirements apply?",
        placeholder: "Review the pre-ticked set and correct it if needed",
        inputType: "multiselect",
        optionsKey: "regulatoryRequirements",
        required: true,
        exclusiveValue: "None/Not Applicable",
      },
      {
        key: "retentionRequirement",
        label: "How long must AI activity records be kept?",
        placeholder: "Select the retention obligation",
        inputType: "select",
        optionsKey: "retentionRequirement",
        required: false,
      },
      {
        key: "trainingUseOfData",
        label: "Will our data train the vendor's models?",
        placeholder: "Prefilled from the selected vendor attestation",
        inputType: "confirmDispute",
        optionsKey: "trainingUseOfData",
        required: true,
        stanceKey: "trainingUseOfDataStance",
        noteKey: "trainingUseOfDataDisputeNote",
      },
    ],
  },
  {
    id: "oversight",
    label: "Oversight and control",
    subTitle: "How errors are caught and disclosed",
    fields: [
      {
        key: "humanReviewLevel",
        label: "Is output reviewed by a person before it is used?",
        placeholder: "Select the review level",
        inputType: "select",
        optionsKey: "humanReviewLevel",
        required: true,
      },
      {
        key: "decisionStakes",
        label: "What is at stake if the AI is wrong?",
        placeholder: "Select the severity of potential AI decision errors",
        inputType: "select",
        optionsKey: "decisionStakes",
        required: true,
      },
      {
        key: "aiDisclosure",
        label: "Will people be told they are interacting with AI?",
        placeholder: "Select the disclosure approach",
        inputType: "select",
        optionsKey: "aiDisclosure",
        required: true,
        showWhen: { key: "outputExposure", includes: "Customer-facing" },
      },
    ],
  },
  {
    id: "environment",
    label: "Environment and integration",
    subTitle: "Hosting, systems, and who will implement",
    fields: [
      {
        key: "deploymentModel",
        label: "What deployment model do you require?",
        placeholder: "Enter the required deployment model",
        inputType: "text",
        required: true,
      },
      {
        key: "cloudProvider",
        label: "Primary cloud provider",
        placeholder: "Select all that apply",
        inputType: "multiselect",
        optionsKey: "cloudProvider",
        required: true,
        exclusiveValue: "Not known",
      },
      // {
      //   key: "integrationSystems",
      //   label: "What must it integrate with, and what access does it need?",
      //   placeholder: "Select all systems requiring integration",
      //   inputType: "integrationAccess",
      //   optionsKey: "integrationSystems",
      //   required: true,
      // },
      {
        key: "implementationCapacity",
        label: "Who is doing the implementation work?",
        placeholder: "Select who will do the work",
        inputType: "select",
        optionsKey: "implementationCapacity",
        required: true,
      },
      {
        key: "trainingEffort",
        label: "How much user training will this need?",
        placeholder: "Select the expected training effort",
        inputType: "select",
        optionsKey: "trainingEffort",
        required: true,
      },
    ],
  },
  {
    id: "vendorTrust",
    label: "Vendor trust",
    subTitle: "Evidence you hold and vendor-stated positions from attestation",
    fields: [
      {
        key: "vendorEvidenceReceived",
        label: "What evidence do you actually hold?",
        placeholder: "Prefilled from the selected vendor attestation",
        inputType: "evidenceHold",
        optionsKey: "vendorEvidenceReceived",
        required: false,
        exclusiveValue: "Nothing yet",
        readOnly: true,
      },
      {
        key: "monitoringDataAvailable",
        label: "Usage data for monitoring",
        placeholder: "Prefilled from the selected vendor attestation",
        inputType: "text",
        required: false,
        readOnly: true,
        stanceKey: "monitoringDataStance",
        noteKey: "monitoringDataDisputeNote",
      },
      {
        key: "auditLogsAvailable",
        label: "Audit logs for AI decisions and access",
        placeholder: "Prefilled from the selected vendor attestation",
        inputType: "text",
        required: false,
        readOnly: true,
        stanceKey: "auditLogsStance",
        noteKey: "auditLogsDisputeNote",
      },
      {
        key: "dataExportCapability",
        label: "Can we export our data if we leave?",
        placeholder: "Prefilled from the selected vendor attestation",
        inputType: "text",
        required: false,
        readOnly: true,
        stanceKey: "dataExportStance",
        noteKey: "dataExportDisputeNote",
      },
    ],
  },
  {
    id: "exit",
    label: "If it goes wrong or goes away",
    subTitle: "Operational and commercial exit cost",
    fields: [
      {
        key: "unavailabilityImpact",
        label: "If this became unavailable or you stopped using it, what happens?",
        placeholder: "Select the operational impact",
        inputType: "select",
        optionsKey: "unavailabilityImpact",
        required: true,
      },
      {
        key: "contractsInPlace",
        label: "What is already signed with this vendor?",
        placeholder: "Select all that apply",
        inputType: "multiselect",
        optionsKey: "contractsInPlace",
        required: true,
        exclusiveValue: "Nothing signed yet",
      },
      {
        key: "contractNoticePeriod",
        label: "Notice period",
        placeholder: "Select the commercial notice period",
        inputType: "select",
        optionsKey: "contractNoticePeriod",
        required: false,
      },
    ],
  },
  {
    id: "provenance",
    label: "Provenance",
    subTitle: "Who completed this and when to review it again",
    fields: [
      {
        key: "assessorName",
        label: "Who completed this?",
        placeholder: "Name and role of the person completing the assessment",
        inputType: "assessor",
        required: true,
      },
      {
        key: "answerConfidence",
        label: "How confident are you in these answers?",
        placeholder: "Select your confidence",
        inputType: "select",
        optionsKey: "answerConfidence",
        required: true,
      },
      {
        key: "reviewDueDate",
        label: "Review again on",
        placeholder: "Defaults to 90 days from today",
        inputType: "date",
        required: false,
      },
    ],
  },
];

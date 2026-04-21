export const VENDOR_SELF_ATTESTATION = {
  company_profile: {
    0: {
      label: "What type of vendor are you?",
      placeholder:
        "Select the category that best describes your primary business model",
      required: true,
    },
    1: {
      label: "What is your Target Industries",
      placeholder: "Select your target industries",
      required: true,
    },
    2: {
      label: "What stage is your company at?",
      placeholder: "Select your current business stage",
      required: true,
    },
    3: {
      label: "Company Website",
      placeholder: "https://www.yourcompany.com",
      required: true,
    },
    4: {
      label: "Brief Company Description",
      placeholder:
        "In 2-3 sentences, describe what your company does and the value you provide",
      required: true,
    },
    5: {
      label: "Approximate Number of Employees",
      placeholder: "Select the range that includes your total headcount",
      required: true,
    },
    6: {
      label: "Year Company Founded",
      placeholder: "Enter 4-digit year (e.g., 2018)",
      required: true,
    },
    7: {
      label: "Headquarters Location",
      placeholder: "Example: San Francisco, CA, USA",
      required: true,
    },
    8: {
      label: "Geographic Regions Where You Operate",
      placeholder: "Select all regions where you have customers or operations",
      required: true,
    },
  },



  document_upload: {
    0: {
      label: "Marketing and Product Material",
      placeholder:
        "Ability to upload the documents and be parsed to pull necessary information for aspects of the assessment",
      required: false
    },
    1: {
      label: "Technical Product Specifications Material",
      placeholder:
        "Ability to upload the documents and be parsed to pull necessary information for aspects of the assessment",
      required: false
    },
  },

  product_profile: {
    0: {
      label: "Product name",
      placeholder: "Enter the name of your AI product or solution",
      required: true,
    },
    1: {
      label:
        "Who typically makes the purchase decision for Purchasing your AI solution?",
      placeholder:
        "Select all buyer personas that commonly evaluate your solution",
      required: true,
    },
    2: {
      label: "What pain points does your solution solve?",
      placeholder:
        "Describe the top 2-3 problems your AI solution addresses for customers",
      required: true,
    },
    3: {
      label: "What alternatives do customers typically consider?",
      placeholder:
        "List 2-3 direct competitors or alternative solutions (can include 'Build In-House')",
      required: false
    },
    4: {
      label: "What makes your solution unique?",
      placeholder:
        "Describe your top 2-3 competitive advantages or unique capabilities",
      required: false
    },
    5: {
      label: "Typical Customer ROI or Value Metrics",
      placeholder:
        "Example: '30% reduction in manual processing time' or '2x improvement in prediction accuracy'",
      required: true,
    },
  },
  ai_technical_capabilities: {
    0: {
      label: "What AI capabilities does your product provide?",
      placeholder: "Select all AI capabilities your product includes",
      required: true,
    },
    1: {
      label: "What type of AI models does your solution use?",
      placeholder: "Select all that apply to your product",
      required: true,
    },
    2: {
      // label: "How transparent is your AI model?",
      label: "What level of explainability / transparency does your AI provide?",
      placeholder:
        "Select the level that best describes your model transparency",
      required: true,
    },
    3: {
      // label: "What level of autonomy does your AI have?",
      label: "How much decision-making authority does your AI have without human review?",
      placeholder: "Select the level of human involvement in AI decisions",
      required: true,
    },
    4: {
      label: "Do you have a documented AI Governance policy? (upload if yes)",
      placeholder: "Select Yes or No. If Yes, upload your policy document below.",
      required: true,
    },
  },
  compliance_certifications: {
    // 0: {
    //   label: "What security/compliance certifications do you hold?",
    //   placeholder: "Select all current, valid certifications (not in progress)",
    //   required: true,
    // },
    1: {
      // label: "How was this assessment completed?",
      label: "How was your most recent independent compliance audit conducted?",
      placeholder: "Select the validation level for this assessment",
      required: true,
    },
    2: {
      label: "How often are you independently audited?",
      placeholder: "Select your independent audit cadence",
      required: true,
    },
  },
  data_handling_privacy: {
    0: {
      // label: "Does your product handle personal information (PII)?",
      label: "What level of personal or sensitive data does your product process?",
      placeholder:
        "Select based on the MOST sensitive PII your product handles",
      required: true,
    },
    1: {
      label: "What data residency options do you offer?",
      placeholder: "Select all data residency options available to customers",
      required: true,
    },
    2: {
      // label: "What is your data retention policy?",
      label: "What is your default customer data retention period? (upload the written policy)",
      placeholder: "Select Yes or No",
      required: true,
    },
  },
  ai_safety_testing: {
    0: {
      label: "How do you test for bias in your AI?",
      placeholder: "Select all bias testing approaches you use",
      required: true,
    },
    1: {
      // label: "Have you completed adversarial/security testing?",
      label: "Have you completed security testing (AI adversarial — prompt injection, jailbreak, robustness — and infrastructure penetration)?",
      placeholder:
        "Testing for prompt injection, jailbreaks, data leakage, etc.",
      required: true,
    },
    2: {
      label: "What human oversight is built into your system?",
      placeholder: "Select all human oversight features your product includes",
      required: true,
    },
    3: {
      label: "Can you document your training data sources?",
      placeholder: "Select your level of training data documentation",
      required: true,
    },
  },

  operations_reliability: {
    0: {
      label: "What uptime SLA do you guarantee?",
      placeholder: "Select your contractual uptime commitment",
      required: true,
    },
    1: {
      label: "What are your support response SLAs by severity (P1 / P2 / P3)?",
      placeholder:
        "Example: P1: within 1 hour, P2: within 4 hours, P3: within 1 business day",
      required: true,
    },
    2: {
      label: "Describe your change management / release cadence",
      placeholder:
        "Example: weekly release train with emergency hotfix process and rollback controls",
      required: true,
    },
    3: {
      label: "Do you have a documented incident response plan?",
      placeholder: "Select your incident response maturity level",
      required: true,
    },
    4: {
      label: "Can you roll back deployments if issues occur?",
      placeholder: "Select your deployment rollback capability",
      required: true,
    },
  },

  deployment_architecture: {
    0: {
      label: "How is your solution hosted / deployed?",
      placeholder: "Select all deployment options you support",
      required: true,
    },
    1: {
      label: "What is your typical deployment scale?",
      placeholder: "Select your most common deployment size",
      required: true,
    },
    2: {
      // label: "What stage is your product currently in?",
      label: "What maturity stage is *this product* at?",
      placeholder: "Select your current product maturity stage",
      required: true,
    },
  },

  evidence_supporting_documentation: {
    0: {
      // label: "Upload Testing and Policy Documentation (Optional)",
      label: "Upload supporting testing and policy documentation",
      placeholder:
        "Upload supporting documentation for certifications and security controls",
      required: false
    },
    1: {
      // label: "Do you have interaction/usage data available?",
      label: "What usage / interaction telemetry do you capture and make available for audit?",
      placeholder: "Can you provide data on how users interact with your AI?",
      required: true,
    },
    2: {
      // label: "Are audit logs available?",
      label: "Are customer-accessible audit logs available (exportable to SIEM)?",
      placeholder:
        "Do you maintain detailed audit trails of AI decisions and access?",
      required: true,
    },
    3: {
      // label: "Are testing results available?",
      label: "Are model / safety testing results made available to customers under NDA?",
      placeholder:
        "Can you provide results from bias, security, or performance testing?",
      required: true,
    },
  },
};

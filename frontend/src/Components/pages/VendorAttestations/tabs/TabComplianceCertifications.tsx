/**
 * Vendor Self Attestation – Compliance & Certifications tab content.
 * Includes "Which compliance certifications do you hold? (attach evidence for each)" upload (moved from Document Upload).
 * Uses standard FileUpload UI per certification (one file, max 10MB).
 */
import type { ReactNode } from "react";
import { toast } from "react-toastify";
import AttestationDynamicStep from "../AttestationDynamicStep";
import FormField from "../../../UI/FormField";
import FileUpload from "../../../UI/FileUpload";
import ChipMultiSelect from "../../../UI/ChipMultiSelect";
import {
  DOCUMENT_CATEGORIES,
  MAX_FILE_SIZE_BYTES,
} from "../../../../constants/vendorAttestationDocumentConstants";
import type {
  VendorSelfAttestationPayload,
  DocumentUploadState,
} from "../../../../types/vendorSelfAttestation";

export interface TabComplianceCertificationsProps {
  attestation: VendorSelfAttestationPayload;
  setAttestation: React.Dispatch<React.SetStateAction<VendorSelfAttestationPayload>>;
  data: Record<string, { label: string; placeholder?: string; required?: boolean }>;
  fieldErrors?: Record<string, string>;
  title?: string;
  subTitle?: string;
  icon?: ReactNode;
  documentUpload?: DocumentUploadState;
  setDocumentUpload?: React.Dispatch<React.SetStateAction<DocumentUploadState>>;
  attestationId?: string | null;
  onUploadDocument?: (attestationId: string, file: File) => Promise<string>;
  onStorePendingFiles?: (
    slot: "0" | "1" | "evidenceTestingPolicy" | "aiGovernancePolicy",
    files: File[],
    category?: string,
  ) => void;
  onOpenDocument?: (fileName: string) => void;
}

const REGULATORY_LABEL = "Which compliance certifications do you hold? (attach evidence for each)";
const REGULATORY_PLACEHOLDER =
  "Select certification types; for each certificate you can upload one file (max 10MB). Documents are parsed for assessment information.";
const NONE_CERTIFICATION_VALUE = "None";

function TabComplianceCertifications({
  attestation,
  setAttestation,
  data,
  fieldErrors,
  title = "Compliance & Certifications",
  subTitle,
  icon,
  documentUpload,
  setDocumentUpload,
  attestationId,
  onUploadDocument,
  onStorePendingFiles,
  onOpenDocument,
}: TabComplianceCertificationsProps) {
  const regulatory = documentUpload?.["2"] ?? { categories: [], byCategory: {} };
  const categories = regulatory.categories ?? [];
  const byCategory = regulatory.byCategory ?? {};
  const selectedUploadCategories = categories.filter(
    (category) => category !== NONE_CERTIFICATION_VALUE,
  );
  const hasNoCertificationsSelected = categories.includes(NONE_CERTIFICATION_VALUE);

  const setRegulatoryCategories = (selected: string[]) => {
    setDocumentUpload?.((prev) => {
      const prev2 = prev["2"] ?? { categories: [], byCategory: {} };
      return {
        ...prev,
        "2": {
          categories: selected,
          byCategory: selected.reduce(
            (acc, cat) => ({ ...acc, [cat]: prev2.byCategory?.[cat] ?? [] }),
            {} as Record<string, string[]>
          ),
        },
      };
    });
  };

  const setFilesForCategory = (category: string, fileNames: string[]) => {
    setDocumentUpload?.((prev) => {
      const prev2 = prev["2"] ?? { categories: [], byCategory: {} };
      return {
        ...prev,
        "2": {
          ...prev2,
          byCategory: { ...(prev2.byCategory ?? {}), [category]: fileNames },
        },
      };
    });
  };

  const handleFilesChangeForCategory = async (
    category: string,
    fileNames: string[],
    selectedFiles?: File[],
  ) => {
    const current = byCategory[category] ?? [];
    if (attestationId && onUploadDocument && selectedFiles?.length) {
      const uploaded: string[] = [];
      for (const file of selectedFiles) {
        try {
          uploaded.push(await onUploadDocument(attestationId, file));
        } catch {
          uploaded.push(file.name);
        }
      }
      setFilesForCategory(category, [...current, ...uploaded]);
    } else {
      if (!attestationId && selectedFiles?.length && onStorePendingFiles) {
        onStorePendingFiles("2", selectedFiles, category);
      }
      setFilesForCategory(category, fileNames);
    }
  };

  return (
    <>
      <AttestationDynamicStep
        title={title}
        subTitle={subTitle}
        icon={icon}
        sectionKey="compliance_certifications"
        data={data}
        attestation={attestation}
        setAttestation={setAttestation}
        fieldErrors={fieldErrors}
      />

      {/* Which compliance certifications do you hold? (attach evidence for each) */}
      {documentUpload != null && setDocumentUpload != null && (
        <div className="form_fields_vendor" style={{ marginTop: "1.5rem" }}>
          {fieldErrors?.regulatoryCertificationMaterial && (
            <p className="orgError" style={{ marginBottom: "0.5rem" }} role="alert">
              {fieldErrors.regulatoryCertificationMaterial}
            </p>
          )}
          <FormField
            label={REGULATORY_LABEL}
            mandatory={true}
            tooltipText={REGULATORY_PLACEHOLDER}
          >
            <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.5rem" }}>
              Select certification types and upload one file per certification. Max 10MB per file.
            </p>
            <ChipMultiSelect
              id="regulatory-document-categories-compliance"
              labelName=""
              options={DOCUMENT_CATEGORIES.map((c) => ({ label: c.label, value: c.value }))}
              value={categories}
              onChange={setRegulatoryCategories}
              globalExclusiveValue={NONE_CERTIFICATION_VALUE}
            />
          </FormField>
          {hasNoCertificationsSelected && (
            <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#6b7280" }}>
              No certification selected. File upload is not required.
            </p>
          )}
          {selectedUploadCategories.length > 0 && (
            <div style={{ marginTop: "1rem" }} className="compliance_cert_categories">
              {selectedUploadCategories.map((category) => {
                const docs = byCategory[category] ?? [];
                return (
                  <div key={category} className="form_fields_vendor compliance_cert_category_block" style={{ marginBottom: "1rem" }}>
                    <FormField
                      label={category}
                      mandatory={false}
                      tooltipText={`Upload one file for ${category}. Max 10MB.`}
                    >
                      <FileUpload
                        accept=".pdf,.doc,.docx,.ppt,.pptx"
                        maxSizeBytes={MAX_FILE_SIZE_BYTES}
                        maxFiles={1}
                        value={byCategory[category] ?? []}
                        onFilesChange={(fileNames, selectedFiles) =>
                          handleFilesChangeForCategory(category, fileNames, selectedFiles)
                        }
                        onValidationError={(msg) => msg && toast.error(msg)}
                        disabled={(byCategory[category] ?? []).length >= 1}
                      />
                    </FormField>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default TabComplianceCertifications;

/**
 * Vendor Self Attestation – AI Technical Capabilities tab content.
 * Includes documented AI governance policy (Yes/No) with upload when Yes.
 */
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { toast } from "react-toastify";
import AttestationDynamicStep from "../AttestationDynamicStep";
import FormField from "../../../UI/FormField";
import FileUpload from "../../../UI/FileUpload";
import type {
  VendorSelfAttestationPayload,
  DocumentUploadState,
} from "../../../../types/vendorSelfAttestation";
import { MAX_FILE_SIZE_BYTES, MAX_FILES_PER_UPLOAD } from "../../../../constants/vendorAttestationDocumentConstants";

export interface TabAITechCapabilitiesProps {
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

const AI_GOV_UPLOAD_HELPER =
  "Accepted: PDF, Word, or PowerPoint (max 10MB per file). Required when you answer Yes.";

function TabAITechCapabilities({
  attestation,
  setAttestation,
  data,
  fieldErrors,
  title = "AI Technical Capabilities",
  subTitle,
  icon,
  documentUpload,
  setDocumentUpload,
  attestationId,
  onUploadDocument,
  onStorePendingFiles,
}: TabAITechCapabilitiesProps) {
  const showPolicyUpload = attestation.documented_ai_governance_policy === "Yes";
  const current = documentUpload?.aiGovernancePolicy ?? [];
  const prevPolicy = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const cur = attestation.documented_ai_governance_policy;
    if (prevPolicy.current === "Yes" && cur === "No" && setDocumentUpload) {
      setDocumentUpload((p) => ({ ...p, aiGovernancePolicy: [] }));
    }
    prevPolicy.current = cur;
  }, [attestation.documented_ai_governance_policy, setDocumentUpload]);

  const handlePolicyFilesChange = async (fileNames: string[], selectedFiles?: File[]) => {
    if (!setDocumentUpload) return;
    if (attestationId && onUploadDocument && selectedFiles?.length) {
      const uploaded: string[] = [];
      for (const file of selectedFiles) {
        try {
          uploaded.push(await onUploadDocument(attestationId, file));
        } catch {
          toast.error("Upload failed for one or more files.");
          uploaded.push(file.name);
        }
      }
      setDocumentUpload((prev) => ({
        ...prev,
        aiGovernancePolicy: [...(prev.aiGovernancePolicy ?? []), ...uploaded],
      }));
    } else {
      if (!attestationId && selectedFiles?.length && onStorePendingFiles) {
        onStorePendingFiles("aiGovernancePolicy", selectedFiles);
      }
      setDocumentUpload((prev) => ({
        ...prev,
        aiGovernancePolicy: fileNames,
      }));
    }
  };

  return (
    <>
      <AttestationDynamicStep
        title={title}
        subTitle={subTitle}
        icon={icon}
        sectionKey="ai_technical_capabilities"
        data={data}
        attestation={attestation}
        setAttestation={setAttestation}
        fieldErrors={fieldErrors}
      />
      {showPolicyUpload && setDocumentUpload && (
        <div className="form_fields_vendor" style={{ marginTop: "1rem" }}>
          <FormField
            label="Upload AI Governance policy"
            mandatory
            tooltipText={AI_GOV_UPLOAD_HELPER}
            errorText={fieldErrors?.aiGovernancePolicy}
          >
            <p
              className="evidence-helper"
              style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.5rem" }}
            >
              {AI_GOV_UPLOAD_HELPER}
            </p>
            <FileUpload
              accept=".pdf,.doc,.docx,.ppt,.pptx"
              maxSizeBytes={MAX_FILE_SIZE_BYTES}
              maxFiles={MAX_FILES_PER_UPLOAD}
              value={current}
              onFilesChange={(fileNames, selectedFiles) =>
                void handlePolicyFilesChange(fileNames, selectedFiles)
              }
            />
          </FormField>
        </div>
      )}
    </>
  );
}

export default TabAITechCapabilities;

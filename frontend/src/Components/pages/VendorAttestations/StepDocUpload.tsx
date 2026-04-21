/**
 * Document Upload step: sections 0 and 1 are fixed file uploads (Marketing, Technical).
 * "Which compliance certifications do you hold? (attach evidence for each)" is in the Compliance & Certifications tab.
 * Heading, subheading, and icon follow Vendor Onboarding UI pattern.
 */
import type { ReactNode } from "react";
import HeaderForVendor from "../VendorOnboarding/HeaderForVendor";
import FormField from "../../UI/FormField";
import FileUpload from "../../UI/FileUpload";
import {
  DOCUMENT_UPLOAD_HELPER_TEXT,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_UPLOAD,
} from "../../../constants/vendorAttestationDocumentConstants";
import type { DocumentUploadState } from "../../../types/vendorSelfAttestation";

interface StepDocUploadProps {
  data: Record<string, { label: string; placeholder?: string; required?: boolean }>;
  documentUpload: DocumentUploadState;
  setDocumentUpload: React.Dispatch<React.SetStateAction<DocumentUploadState>>;
  /** When set, selected files are uploaded to the server; stored file names are added to state. */
  attestationId?: string | null;
  /** Upload one file for this attestation; returns the stored file name. */
  onUploadDocument?: (attestationId: string, file: File) => Promise<string>;
  /** When no attestationId, store selected files here so they can be uploaded on Save Draft / Continue. */
  onStorePendingFiles?: (slot: "0" | "1", files: File[]) => void;
  title?: string;
  subTitle?: string;
  icon?: ReactNode;
}

const StepDocUpload = ({
  data,
  documentUpload,
  setDocumentUpload,
  attestationId,
  onUploadDocument,
  onStorePendingFiles,
  title = "Document Upload",
  subTitle,
  icon,
}: StepDocUploadProps) => {
  const slot0 = documentUpload["0"] ?? [];
  const slot1 = documentUpload["1"] ?? [];

  const setSlot = (slot: "0" | "1", fileNames: string[]) => {
    setDocumentUpload((prev) => ({ ...prev, [slot]: fileNames }));
  };

  const handleFilesChange = async (
    slot: "0" | "1",
    fileNames: string[],
    selectedFiles?: File[],
  ) => {
    const current = slot === "0" ? slot0 : slot1;
    if (attestationId && onUploadDocument && selectedFiles?.length) {
      const uploaded: string[] = [];
      for (const file of selectedFiles) {
        try {
          const storedName = await onUploadDocument(attestationId, file);
          uploaded.push(storedName);
        } catch {
          uploaded.push(file.name);
        }
      }
      setSlot(slot, [...current, ...uploaded]);
    } else {
      if (!attestationId && selectedFiles?.length && onStorePendingFiles) {
        onStorePendingFiles(slot, selectedFiles);
      }
      setSlot(slot, fileNames);
    }
  };

  const label0 = data["0"]?.label ?? "Marketing and Product Material";
  const label1 = data["1"]?.label ?? "Technical Product Specifications Material";

  return (
    <>
      <HeaderForVendor
        title_vendor={title}
        sub_title_vendor={subTitle}
        icon={icon}
        className="header_for_vendor"
      />
      <p className="document-upload-helper" style={{ marginBottom: "1rem", fontSize: "0.875rem", color: "#6b7280" }}>
        {DOCUMENT_UPLOAD_HELPER_TEXT}
      </p>
      {!attestationId && (
        <p className="document-upload-draft-hint" style={{ marginBottom: "0.5rem", fontSize: "0.8125rem", color: "#92400e" }}>
          Save draft first to upload documents to the server.
        </p>
      )}

      {/* Section 0: Marketing and Product Material */}
      <div className="form_fields_vendor" style={{ marginBottom: "1rem" }}>
        <FormField label={label0} mandatory={data["0"]?.required ?? false} tooltipText={data["0"]?.placeholder}>
          <FileUpload
            accept=".pdf,.doc,.docx,.ppt,.pptx"
            maxSizeBytes={MAX_FILE_SIZE_BYTES}
            maxFiles={MAX_FILES_PER_UPLOAD}
            value={slot0}
            onFilesChange={(fileNames, selectedFiles) => handleFilesChange("0", fileNames, selectedFiles)}
          />
        </FormField>
      </div>

      {/* Section 1: Technical Product Specifications Material */}
      <div className="form_fields_vendor" style={{ marginBottom: "1.5rem" }}>
        <FormField label={label1} mandatory={data["1"]?.required ?? false} tooltipText={data["1"]?.placeholder}>
          <FileUpload
            accept=".pdf,.doc,.docx,.ppt,.pptx"
            maxSizeBytes={MAX_FILE_SIZE_BYTES}
            maxFiles={MAX_FILES_PER_UPLOAD}
            value={slot1}
            onFilesChange={(fileNames, selectedFiles) => handleFilesChange("1", fileNames, selectedFiles)}
          />
        </FormField>
      </div>
    </>
  );
};

export default StepDocUpload;

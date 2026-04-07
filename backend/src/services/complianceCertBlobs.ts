/**
 * Build searchable blobs for certification scoring (vendor attestation + org portal insights).
 */

export function collectComplianceUploadFileNames(payload: Record<string, unknown>): string[] {
  const names: string[] = [];
  const docUploads =
    payload.document_uploads && typeof payload.document_uploads === "object"
      ? (payload.document_uploads as Record<string, unknown>)
      : payload.documentUpload && typeof payload.documentUpload === "object"
        ? (payload.documentUpload as Record<string, unknown>)
        : null;
  if (docUploads?.["2"] && typeof docUploads["2"] === "object" && !Array.isArray(docUploads["2"])) {
    const slot2 = docUploads["2"] as Record<string, unknown>;
    const byCategory =
      slot2.byCategory && typeof slot2.byCategory === "object"
        ? (slot2.byCategory as Record<string, unknown>)
        : {};
    Object.values(byCategory).forEach((arr) => {
      if (Array.isArray(arr)) {
        arr.forEach((name) => {
          if (typeof name === "string" && name.trim()) names.push(name.trim());
        });
      }
    });
  }
  return names;
}

export function certificationFormTextFromGetter(get: (k: string) => unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
      return;
    }
    const t = String(v).trim();
    if (t) parts.push(t);
  };
  walk(get("security_certifications"));
  walk(get("security_compliance_certificates"));
  walk(get("regulatorycompliance_cert_material"));
  return parts.join(" ");
}

export function buildCertificationsSearchBlobsFromPayload(payload: Record<string, unknown>): {
  certificationsSearchBlob: string;
  complianceUploadBlob: string;
} {
  const complianceUploadNames = collectComplianceUploadFileNames(payload);
  const complianceUploadBlob = complianceUploadNames.join(" ").toLowerCase();
  const get = (k: string) => payload[k];
  const certFormBlob = certificationFormTextFromGetter(get).toLowerCase();
  return {
    certificationsSearchBlob: `${certFormBlob} ${complianceUploadBlob}`.trim(),
    complianceUploadBlob,
  };
}

/** Flatten buyer-stated vendor certifications (array / JSON string / plain string) for scoring. */
export function buyerVendorCertificationsToSearchBlob(vendorCertifications: unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (v == null) return;
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach(walk);
      return;
    }
    const t = String(v).trim();
    if (t) parts.push(t);
  };
  if (typeof vendorCertifications === "string") {
    const s = vendorCertifications.trim();
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        walk(JSON.parse(s));
      } catch {
        parts.push(s);
      }
    } else {
      parts.push(s);
    }
  } else {
    walk(vendorCertifications);
  }
  return parts.join(" ").toLowerCase();
}

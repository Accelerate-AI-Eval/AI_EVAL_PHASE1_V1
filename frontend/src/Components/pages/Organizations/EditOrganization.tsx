import { Ban, CircleX, Landmark, CircleArrowUp, Shield, FileText } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { getOrganizations } from "../../../Context/OrganizationsData";
import { toast } from "react-toastify";
import "../UserProfile/user_profile.css";
import "../../../styles/popovers.css";

const EditOrganization = ({ setIsEdit, id, orgData, allOrganizations = [] }) => {
  const BASE_URL = import.meta.env.VITE_BASE_URL;

  const [isError, setIsError] = useState("");
  const [isUpdateLoading, setIsUpdateLoading] = useState(false);
  const dispatch = useDispatch();
  const [isOrganizationName, setIsOrganizationName] = useState("");
  const [isStatus, setIsStatus] = useState("");
  const [isReason, setIsReason] = useState("");

  useEffect(() => {
    if (id) dispatch(getOrganizations());
  }, [id, dispatch]);

  useEffect(() => {
    if (orgData) {
      setIsOrganizationName(orgData.organizationName);
      setIsStatus(orgData.organizationStatus);
    }
  }, [orgData]);

  const closeUpdateOrg = () => {
    setIsEdit(false);
    setIsStatus("");
    setIsReason("");
  };

  const updateOrg = async (e) => {
    e.preventDefault();
    const userId = sessionStorage.getItem("userId");
    if (!isOrganizationName.trim()) {
      setIsError("Organization Name is required");
      return;
    }
    if (!isStatus.trim() || isStatus === "select") {
      setIsError("Status is required");
      return;
    }
    if (!isReason.trim()) {
      setIsError("Reason is required");
      return;
    }

    const trimmedName = isOrganizationName.trim();
    const nameAlreadyExists = (allOrganizations ?? []).some(
      (org) => String(org.id) !== String(id) && (org.organizationName ?? "").trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameAlreadyExists) {
      setIsError("Organization already present");
      return;
    }

    if (
      orgData &&
      trimmedName === (orgData.organizationName ?? "").trim() &&
      isStatus.trim() === orgData.organizationStatus
    ) {
      setIsError("Nothing is Updated");
      return;
    }
    const data = {
      isOrganization: isOrganizationName,
      isStatus,
      isReason,
      userId,
    };

    const token = sessionStorage.getItem("bearerToken");

    setIsUpdateLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/updateOrganizations/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (response.ok) {
        closeUpdateOrg();
        setIsOrganizationName("");
        toast.success("Organization updated successfully");
        dispatch(getOrganizations());
        setIsError("");
      } else {
        setIsError(result.message ?? "Failed to update organization");
      }
    } catch (error) {
      console.error(error);
      toast.error("Network or server error. Please try again.");
    } finally {
      setIsUpdateLoading(false);
    }
  };

  return (
    <div
      className="profile_modal_overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit_org_modal_title"
      onClick={(e) => e.target === e.currentTarget && closeUpdateOrg()}
    >
      <div className="profile_modal_content settings_modal_content" onClick={(e) => e.stopPropagation()}>
        <div className="profile_modal_header">
          <h2 id="edit_org_modal_title" className="profile_modal_title">
            Update Organization
          </h2>
          <button
            type="button"
            className="modal_close_btn"
            onClick={closeUpdateOrg}
            aria-label="Close"
          >
            <CircleX size={20} />
          </button>
        </div>
        <div className="profile_modal_body">
          <form action="" autoComplete="off" onSubmit={updateOrg} className="settings_form">
            <div className="settings_form_row">
              <div className="settings_form_group">
                <label htmlFor="edit_org_name">
                  <Landmark size={16} aria-hidden />
                  Organization Name
                </label>
                <input
                  id="edit_org_name"
                  type="text"
                  className="settings_input"
                  value={isOrganizationName}
                  onChange={(e) => {
                    setIsOrganizationName(e.target.value);
                    if (isError) setIsError("");
                  }}
                />
              </div>
              <div className="settings_form_group">
                <label htmlFor="edit_org_status">
                  <Shield size={16} aria-hidden />
                  Status
                </label>
                <select
                  id="edit_org_status"
                  value={isStatus}
                  onChange={(e) => setIsStatus(e.target.value)}
                  className={`settings_input settings_input_cursor_pointer ${!isStatus || isStatus === "select" ? "select_input--placeholder" : ""}`}
                >
                  <option value="select" disabled>
                    SELECT
                  </option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="settings_form_row">
              <div className="settings_form_group" style={{ flex: "1 1 100%" }}>
                <label htmlFor="edit_org_reason">
                  <FileText size={16} aria-hidden />
                  Reason
                </label>
                <textarea
                  id="edit_org_reason"
                  className="settings_input"
                  value={isReason}
                  onChange={(e) => setIsReason(e.target.value)}
                  rows={3}
                  style={{ resize: "none", minHeight: "4em" }}
                />
              </div>
            </div>
            {isError && <p className="settings_error">{isError}</p>}
            <div className="settings_form_actions">
              <button type="button" className="orgCancelBtn" onClick={closeUpdateOrg}>
                <Ban size={16} aria-hidden />
                Cancel
              </button>
              <button
                type="submit"
                className={`orgCreateBtn ${isUpdateLoading ? "disabled_css" : ""}`}
                disabled={isUpdateLoading}
                aria-busy={isUpdateLoading}
              >
                <CircleArrowUp size={16} aria-hidden />
                {isUpdateLoading ? "Saving…" : "Update"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditOrganization;

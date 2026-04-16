import { Ban, CircleX, Landmark, Plus, Mail, Tags, Shield } from "lucide-react";
import React, { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { getOrganizations } from "../../../Context/OrganizationsData";
import "../UserProfile/user_profile.css";

const CreateOrganization = ({ setIsOrganization }) => {
  const BASE_URL = import.meta.env.VITE_BASE_URL;

  const [isOrganizationName, setIsOrganizationName] = useState("");
  const [organizationType, setOrganizationType] = useState("vendor");
  const [adminEmail, setAdminEmail] = useState("");
  const [isError, setIsError] = useState("");
  const [isCreateLoading, setIsCreateLoading] = useState(false);
  const dispatch = useDispatch();
  const { data: organizations } = useSelector((state) => state.organizations);
  const closeNewOrg = () => {
    setIsOrganization(false);
    setIsError("");
  };

  const createOrg = async (e) => {
    e.preventDefault();

    const nameTrimmed = isOrganizationName?.trim() ?? "";
    if (!nameTrimmed) {
      setIsError("Organization name is required");
      return;
    }

    const emailTrimmed = adminEmail?.trim() ?? "";
    if (!emailTrimmed) {
      setIsError("Admin email is required");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      setIsError("Please enter a valid email address");
      return;
    }

    const nameLower = nameTrimmed.toLowerCase();
    const duplicate = (organizations ?? []).some(
      (org) => (org.organizationName ?? "").trim().toLowerCase() === nameLower,
    );
    if (duplicate) {
      setIsError("An organization with this name already exists.");
      return;
    }

    const user = sessionStorage.getItem("userId");
    const orgData = {
      isOrganizationName: nameTrimmed,
      user,
      organizationType,
      adminEmail: emailTrimmed,
    };
    const token = sessionStorage.getItem("bearerToken");

    setIsCreateLoading(true);
    try {
      const response = await fetch(`${BASE_URL}/newOrganization`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(orgData),
      });
      const result = await response.json();
      if (response.ok) {
        closeNewOrg();
        setIsOrganizationName("");
        setOrganizationType("vendor");
        setAdminEmail("");
        toast.success("Organization created successfully");
        dispatch(getOrganizations());
        setIsError("");
      } else {
        setIsError(result.message ?? "Failed to create organization");
      }
    } catch (error) {
      console.error(error);
      toast.error("Network or server error. Please try again.");
    } finally {
      setIsCreateLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="newOrg">
        <div className="newOrgHeading">
          <h2>Create Organization</h2>
          <span onClick={closeNewOrg}>
            <CircleX />
          </span>
        </div>
        <div className="orgDetails">
          <form action="" autoComplete="off" onSubmit={createOrg}>
            <div className="orgName">
              <label htmlFor="orgname">
                <span>
                  <Landmark width={20} />
                </span>
                Organization Name
              </label>
              <input
                id="orgname"
                type="text"
                value={isOrganizationName}
                onChange={(e) => setIsOrganizationName(e.target.value)}
              />
            </div>
            <div className="orgName">
              <label htmlFor="orgtype">
                <span>
                  <Tags width={20} />
                </span>
                Organization Type
              </label>
              <select
                id="orgtype"
                value={organizationType}
                onChange={(e) => setOrganizationType(e.target.value)}
                aria-label="Organization type"
              >
                <option value="vendor">Vendor</option>
                <option value="buyer">Buyer</option>
              </select>
            </div>
            <div className="orgName">
              <label htmlFor="orgadminemail">
                <span>
                  <Mail width={20} />
                </span>
                Admin email
              </label>
              <input
                id="orgadminemail"
                type="email"
                autoComplete="email"
                placeholder="admin@company.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
            </div>
            <div className="orgName">
              <label htmlFor="orgadminrole">
                <span>
                  <Shield width={20} />
                </span>
                Role
              </label>
              <input
                id="orgadminrole"
                type="text"
                className="orgReadonlyField"
                value="Admin"
                readOnly
                disabled
                aria-readonly="true"
              />
            </div>
            {isError && <p className="orgError">{isError}</p>}
            <div className="settings_form_actions">
              <button type="button" className="orgCancelBtn" onClick={closeNewOrg}>
                <Ban size={16} aria-hidden />
                Cancel
              </button>
              <button
                type="submit"
                className={`orgCreateBtn ${isCreateLoading ? "disabled_css" : ""}`}
                disabled={isCreateLoading}
                aria-busy={isCreateLoading}
              >
                <Plus size={16} aria-hidden />
                {isCreateLoading ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateOrganization;

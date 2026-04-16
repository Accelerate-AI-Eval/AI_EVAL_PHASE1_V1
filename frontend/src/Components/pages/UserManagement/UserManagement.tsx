import {
  UserPlus,
  Ban,
  Send,
  Mail,
  Landmark,
  UserStar,
  CircleX,
  Settings,
  Users,
  ClipboardList,
  Eye,
  Info,
  Shield,
  Store,
  ShoppingCart,
  ShieldCheck,
  LayoutDashboard,
  BookOpen,
  UserCheck,
  Wrench,
  Sparkles,
} from "lucide-react";
import Button from "../../UI/Button";
import "../../../styles/page_tabs.css";
import "./user_management.css";
import { useState, useEffect } from "react";
import Modal from "../../UI/Modal";
import Input from "../../UI/Input";
import Select from "../../UI/Select";
import UserDataTable from "./UserDataTable";
import { toast } from "react-toastify";
import { useDispatch, useSelector } from "react-redux";
import { getOrganizations } from "../../../Context/OrganizationsData";

type RoleCategory = "system" | "vendor" | "buyer";

const ROLE_CATEGORIES: {
  id: RoleCategory;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  description: string;
}[] = [
  {
    id: "system",
    label: "System Administrator",
    icon: Shield,
    description:
      "Platform-level roles for system administration and directory curation.",
  },
  {
    id: "vendor",
    label: "Vendor",
    icon: Store,
    description:
      "Organization roles for vendors: Trust & Sales Acceleration (T&SA) and org administration.",
  },
  {
    id: "buyer",
    label: "Buyer",
    icon: ShoppingCart,
    description:
      "Organization roles for buyers: AI Adoption and org administration.",
  },
];

const ROLE_DEFINITIONS: {
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number }>;
  category: RoleCategory;
}[] = [
  // System Roles
  {
    title: "System Admin",
    description: "Full access across the platform.",
    icon: ShieldCheck,
    category: "system",
  },
  {
    title: "System Manager",
    description: "Full access to select modules; view-only for others.",
    icon: LayoutDashboard,
    category: "system",
  },
  {
    title: "System Viewer",
    description: "View-only access across platform; no access to Sales Agent .",
    icon: Eye,
    category: "system",
  },
  {
    title: "AI Directory Curator",
    description:
      "Full access to Attestations and AI Vendor Directory; view-only for dashboard and no access elsewhere.",
    icon: BookOpen,
    category: "system",
  },
  // Vendor Roles
  {
    title: "T&SA Admin",
    description: "Full access across vendor platform.",
    icon: Settings,
    category: "vendor",
  },
  {
    title: "T&SA Manager",
    description: "Full access across vendor platform; view-only for Reports",
    icon: ClipboardList,
    category: "vendor",
  },
  {
    title: "T&SA Lead",
    description: "Full access across vendor platform except user management; view-only for Reports",
    icon: UserCheck,
    category: "vendor",
  },
  {
    title: "T&SA Engineer",
    description: "Full access to Dashboard, Attestation and Assessmnet; view-only for Reports and product profile",
    icon: Wrench,
    category: "vendor",
  },
  {
    title: "T&SA Viewer",
    description: "Read-only access to Dashboard,Assessments,published reports and Product Profile.",
    icon: Eye,
    category: "vendor",
  },
  // Buyer Roles
  {
    title: "AI Adoption Admin",
    description: "Full access across AI Adoption platform.",
    icon: Settings,
    category: "buyer",
  },
  {
    title: "AI Adoption Manager",
    description:
      "Full access for Dashboard, AI Vendor Directory, Assessments, Risk Mapping, Reports, and User Management pages.",
    icon: Sparkles,
    category: "buyer",
  },
  {
    title: "AI Adoption Lead",
    description:
      "Full access for Dashboard, AI Vendor Directory, Assessments, Risk Mapping, and Reports; no access to User Management.",
    icon: UserCheck,
    category: "buyer",
  },
  {
    title: "AI Adoption Engineer",
    description:
      "Full access for Dashboard, AI Vendor Directory, and Assessments; limited access for Risk Mapping and Reports (user-based details only); no access to User Management.",
    icon: Wrench,
    category: "buyer",
  },
  {
    title: "AI Adoption Viewer",
    description:
      "View-only access for Dashboard, AI Vendor Directory, and Reports pages.",
    icon: Eye,
    category: "buyer",
  },
];

const UserManagement = () => {
  useEffect(() => {
    document.title = "AI-Q | User Management Settings";
  }, []);

  const BASE_URL = import.meta.env.VITE_BASE_URL;
  const [activeTab, setActiveTab] = useState<"users" | "general">("users");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInviteLoading, setIsInviteLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [role, setRole] = useState("");
  const [userListRefreshKey, setUserListRefreshKey] = useState(0);
  const dispatch = useDispatch();
  const { data } = useSelector((state) => state.organizations);

  const handleInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const user = sessionStorage.getItem("userId");
    const userFormData = { email, organization, role, user };
    setIsInviteLoading(true);
    try {
      const token = sessionStorage.getItem("bearerToken");
      const response = await fetch(`${BASE_URL}/invite_user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(userFormData),
      });
      const result = await response.json();
      if (response.ok) {
        toast.success("User invited successfully!");
        setIsModalOpen(false);
        setEmail("");
        setOrganization("");
        setRole("");
        setUserListRefreshKey((k) => k + 1);
      } else {
        toast.error(result.message ?? "Failed to invite user");
      }
    } catch (err) {
      console.error("Failed to invite:", err);
      toast.error("Network or server error. Please try again.");
    } finally {
      setIsInviteLoading(false);
    }
  };

  useEffect(() => {
    dispatch(getOrganizations());
  }, [dispatch]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEmail("");
    setOrganization("");
    setRole("");
  };

  const systemRole = (sessionStorage.getItem("systemRole") ?? "")
    .toLowerCase()
    .trim();
  const isVendorOrBuyer = systemRole === "vendor" || systemRole === "buyer";
  const isUserManagementViewOnly =
    systemRole === "system viewer" || systemRole === "system_viewer";
  const userOrgName = (sessionStorage.getItem("organizationName") ?? "").trim();

  // System users with user-management access see all roles; org admins see only their type (vendor or buyer)
  const isSystemUserWithAccess = !isVendorOrBuyer;
  const visibleRoleCategories = isSystemUserWithAccess
    ? ROLE_CATEGORIES
    : ROLE_CATEGORIES.filter((cat) => cat.id === systemRole);

  const baseOrgs = data ?? [];
  const orgsForDropdown =
    isVendorOrBuyer && userOrgName
      ? baseOrgs.filter(
          (org) => (org.organizationName ?? "").trim() === userOrgName,
        )
      : baseOrgs;

  const orgOptions = orgsForDropdown.map((org) => ({
    label: org.organizationName,
    value: org.id,
  }));

  const baseRoleOptions = [
    { value: "admin", label: "Admin" },
    { value: "manager", label: "Manager" },
    { value: "lead", label: "Lead" },
    { value: "engineer", label: "Engineer" },
    { value: "viewer", label: "Viewer" },
  ];
  const vendorRoleOptions = [
    { value: "admin", label: "T&SA Admin" },
    { value: "manager", label: "T&SA Manager" },
    { value: "lead", label: "T&SA Lead" },
    { value: "engineer", label: "T&SA Engineer" },
    { value: "viewer", label: "T&SA Viewer" },
  ];
  const buyerRoleOptions = [
    { value: "admin", label: "AI Adoption Admin" },
    { value: "manager", label: "AI Adoption Manager" },
    { value: "lead", label: "AI Adoption Lead" },
    { value: "engineer", label: "AI Adoption Engineer" },
    { value: "viewer", label: "AI Adoption Viewer" },
  ];
  const selectedOrg = data?.find((o) => String(o.id) === String(organization));
  const orgRoleOptions =
    systemRole === "vendor"
      ? vendorRoleOptions
      : systemRole === "buyer"
        ? buyerRoleOptions
        : baseRoleOptions;
  const roleOptions =
    selectedOrg?.hasAdmin === true
      ? orgRoleOptions.filter((r) => r.value !== "admin")
      : orgRoleOptions;
  const isSystemOrgSelected = organization === "1" || organization === 1;

  const systemRoleOptions = [
    { value: "system admin", label: "System Admin" },
    { value: "system manager", label: "System Manager" },
    { value: "system viewer", label: "System Viewer" },
    { value: "ai directory curator", label: "AI Directory Curator" },
  ];

  return (
    <div className="sec_user_page org_settings_page">
      <div className="org_settings_header page_header_align">
        <div className="org_settings_headers page_header_row">
          <span className="icon_size_header" aria-hidden>
            <Settings size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="org_settings_title">User Management Settings</h1>
            <p className="org_settings_subtitle sub_title_card">
              Manage users and roles.
            </p>
          </div>
        </div>
      </div>

      <div className="page_tabs">
        <button
          type="button"
          className={`page_tab ${activeTab === "users" ? "page_tab_active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          <Users size={18} />
          Users & Roles
        </button>
        <button
          type="button"
          className={`page_tab ${activeTab === "general" ? "page_tab_active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          <Info size={18} />
          General Info
        </button>
      </div>

      {activeTab === "users" && (
        <>
          <div className="org_settings_card team_members_card">
            <div className="team_members_card_header">
              <div>
                <h2 className="org_settings_card_title">Team Members</h2>
                <p className="org_settings_card_subtitle">
                  {isUserManagementViewOnly
                    ? "View users and roles for your organization."
                    : "Manage access and permissions for your organization."}
                </p>
              </div>
              {!isUserManagementViewOnly && (
                <Button
                  className="invite_user_btn org_invite_btn"
                  onClick={() => setIsModalOpen(true)}
                >
                  <UserPlus size={18} />
                  Invite User
                </Button>
              )}
            </div>
            <div className="team_members_table_wrapper">
              <UserDataTable refreshKey={userListRefreshKey} viewOnly={isUserManagementViewOnly} />
            </div>
          </div>
        </>
      )}

      {activeTab === "general" && (
        <div className="org_settings_card">
          {/* <h2 className="org_settings_card_title">General</h2>
          <p className="org_settings_card_subtitle">
            Organization name and general preferences.
          </p> */}
          <div className="role_definitions_section">
            <h3
              className="org_settings_card_title"
              style={{
                fontSize: "1rem",
                marginTop: "1.25rem",
                marginBottom: "0.5rem",
              }}
            >
              Role Definitions
            </h3>
            <p
              className="org_settings_card_subtitle"
              style={{ marginBottom: "1rem" }}
            >
              {isSystemUserWithAccess
                ? "Permissions matrix for available roles by user type."
                : "Permissions matrix for your organization's roles."}
            </p>
            {visibleRoleCategories.map((cat) => {
              const CategoryIcon = cat.icon;
              const rolesInCategory = ROLE_DEFINITIONS.filter(
                (r) => r.category === cat.id,
              );
              return (
                <div
                  key={cat.id}
                  className="role_category_block"
                  data-category={cat.id}
                >
                  <div className="role_category_header">
                    <div className="role_category_icon_wrapper">
                      <CategoryIcon size={24} aria-hidden />
                    </div>
                    <div>
                      <h4 className="role_category_title">{cat.label}</h4>
                      <p className="role_category_desc">{cat.description}</p>
                    </div>
                  </div>
                  <div className="role_definitions_grid">
                    {rolesInCategory.map((r) => {
                      const Icon = r.icon;
                      return (
                        <div
                          key={`${cat.id}-${r.title}`}
                          className="role_definition_card"
                        >
                          <div className="role_heading_icon">
                            <div className="role_definition_icon">
                              <Icon size={18} />
                            </div>
                            <h3 className="role_definition_title">{r.title}</h3>
                          </div>

                          <p className="role_definition_desc">
                            {r.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Modal isOpen={isModalOpen} onClose={handleCloseModal}>
        <div className="header_modal">
          <div>
            <h2 className="modal_popup_title">Invite New User</h2>
            <p className="modal_sub_title">
              Send an invitation email to add a new user to your organization
            </p>
          </div>
          <div className="cancel">
            <button
              type="button"
              className="modal_close_btn"
              onClick={() => setIsModalOpen(false)}
              aria-label="Close"
            >
              <CircleX size={20} />
            </button>
          </div>
        </div>

        <form onSubmit={handleInvite} autoComplete="off">
          <div className="popup_fields">
            <Input
              labelName="Email Address"
              id="email_id"
              type="email"
              icon={<Mail width={20} height={24} />}
              name="user_email_id"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
              }
            />
          </div>
          <div className="popup_fields">
            <Select
              labelName="Organization"
              default_option="Select Organization"
              icon={<Landmark width={20} height={24} />}
              name="user_organization"
              options={orgOptions}
              value={organization}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setOrganization(e.target.value);
                setRole("");
              }}
            />
          </div>
          <div className="popup_fields">
            <Select
              labelName="Role"
              default_option="Select Role"
              icon={<UserStar width={20} height={24} />}
              name="user_role"
              options={isSystemOrgSelected ? systemRoleOptions : roleOptions}
              value={role}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setRole(e.target.value)
              }
            />
          </div>
          <div className="fields_for_button_actions orgBtns">
            <Button
              onClick={() => setIsModalOpen(false)}
              onClose={handleCloseModal}
              className="orgCancelBtn"
              type="button"
            >
              <span>
                <Ban size={16} />
              </span>
              Cancel
            </Button>
            <Button
              type="submit"
              className="orgCreateBtn"
              disabled={isInviteLoading}
              aria-busy={isInviteLoading}
            >
              <span>
                <Send size={16} />
              </span>
              {isInviteLoading ? "Inviting…" : "Invite"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UserManagement;

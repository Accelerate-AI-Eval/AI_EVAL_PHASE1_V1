import {
  Eye,
  SquarePen,
  CircleX,
  Shield,
  Ban,
  Send,
  RefreshCw,
  Mail,
  CheckCircle,
  User,
  Landmark,
  UserStar,
  UserCheck,
  ClipboardCheck,
  Search,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import DataTable from "react-data-table-component";
import { useDispatch, useSelector } from "react-redux";
import { getOrganizations } from "../../../Context/OrganizationsData";
import EditUsers from "./EditUsers";
import LoadingMessage from "../../UI/LoadingMessage";
import Modal from "../../UI/Modal";
import Button from "../../UI/Button";
import { toast } from "react-toastify";
import "../UserProfile/user_profile.css";
import "../../../styles/popovers.css";

const UserDataTable = ({ refreshKey = 0, viewOnly = false }: { refreshKey?: number; viewOnly?: boolean }) => {
  const BASE_URL = import.meta.env.VITE_BASE_URL;

  const [filterText, setFilterText] = React.useState("");
  const [resetPaginationToggle, setResetPaginationToggle] =
    React.useState(false);
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(true);
  const dispatch = useDispatch();
  const { data } = useSelector((state) => state.organizations);
  const [isUserId, setUserId] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [isSelectedUser, selectedIsUser] = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [resendConfirm, setResendConfirm] = useState<{
    type: "reinvite" | "resend";
    user: { id?: number; email?: string; user_name?: string };
  } | null>(null);
  const [resendSending, setResendSending] = useState(false);
  // const tableData = [
  //   {
  //     id: "1",
  //     userName: "Test User",
  //     userStatus: "Active",
  //     userEmail: "testuser@domain.com",
  //     userSystemRole: "System Admin",
  //     userRole: "Admin",
  //     organization_name: "Organization 1",
  //   },
  //   {
  //     id: "2",
  //     userName: "Demo User 2",
  //     userStatus: "Inactive",
  //     userEmail: "test2@domain.com",
  //     userSystemRole: "System Admin",
  //     userRole: "Admin",
  //     organization_name: "Organization 2",
  //   },
  // ];
  // console.log("Organizations data:", data);

  const orgMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    (data || []).forEach((org) => {
      map[org.id] = org.organizationName;
    });
    return map;
  }, [data]);

  useEffect(() => {
    console.log("Organization map:", orgMap);
  }, [orgMap]);

  const LOADER_MIN_MS = 1500; // show loader at least 2–3 seconds

  const usersData = async () => {
    const token = sessionStorage.getItem("bearerToken");
    setLoading(true);
    const startTime = Date.now();
    try {
      const response = await fetch(`${BASE_URL}/allUsers`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (response.ok) {
        setTableData(result.data ?? []);
      }
    } catch (error) {
      console.log(error);
    } finally {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
      await new Promise((r) => setTimeout(r, remaining));
      setLoading(false);
    }
  };

  useEffect(() => {
    usersData();
  }, [refreshKey]);

  useEffect(() => {
    // if (status == "succeeded") {
    dispatch(getOrganizations());
    // }
  }, [dispatch]);

  // const filteredItems = tableData.filter(
  //   (item) =>
  //     item.userName &&
  //     item.userName.toLowerCase().includes(filterText.toLowerCase()),
  // );

  const filteredItems = tableData.filter((item) => {
    if (!filterText.trim()) return true;
    const search = filterText.toLowerCase();
    const userName = (item.user_name ?? "").toLowerCase();
    const email = (item.email ?? "").toLowerCase();
    const orgName = (item.organization_name ?? "").toLowerCase();
    const roleLabel = getRoleLabel(item).toLowerCase();
    const accStatus = (item.account_status ?? "invited").toString().toLowerCase();
    const accountLabel =
      accStatus === "confirmed"
        ? "confirmed"
        : accStatus === "expired" ||
            (accStatus === "invited" && (item.onboarding_status ?? "pending").toString().toLowerCase() === "expired")
          ? "expired"
          : "invited";
    const onboardingStatus = (item.onboarding_status ?? "pending").toString().toLowerCase();
    const onboardingLabel =
      onboardingStatus === "completed" ? "completed" : onboardingStatus === "expired" ? "expired" : "pending";
    const statusLabel = (item.userStatus ?? "active").toString().toLowerCase() === "active" ? "active" : "inactive";
    return (
      userName.includes(search) ||
      email.includes(search) ||
      orgName.includes(search) ||
      roleLabel.includes(search) ||
      accountLabel.includes(search) ||
      onboardingLabel.includes(search) ||
      statusLabel.includes(search)
    );
  });

  const updateUser = (row) => {
    setUserId(row.id);
    setIsEdit(true);
    selectedIsUser(row);
  };

  const openReinviteConfirm = (row: { id?: number; email?: string; user_name?: string }) => {
    if (row.id == null) return;
    setResendConfirm({ type: "reinvite", user: row });
  };

  const openResendOnboardingConfirm = (row: { id?: number; email?: string; user_name?: string }) => {
    if (row.id == null) return;
    setResendConfirm({ type: "resend", user: row });
  };

  const closeResendConfirm = () => {
    if (!resendSending) setResendConfirm(null);
  };

  const executeResend = async () => {
    if (!resendConfirm?.user?.id) return;
    setResendSending(true);
    const id = resendConfirm.user.id;
    const isReinvite = resendConfirm.type === "reinvite";
    const endpoint = isReinvite ? `${BASE_URL}/reinvite_user/${id}` : `${BASE_URL}/resend_onboarding/${id}`;
    const successMsg = isReinvite ? "Signup link resent." : "Onboarding link resent.";
    const errorMsg = isReinvite ? "Failed to resend signup link." : "Failed to resend onboarding link.";
    try {
      const token = sessionStorage.getItem("bearerToken");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message ?? successMsg);
        setResendConfirm(null);
        usersData();
      } else {
        toast.error(data.message ?? errorMsg);
      }
    } catch (e) {
      console.error(e);
      toast.error(errorMsg);
    } finally {
      setResendSending(false);
    }
  };

  //   const subHeaderComponentMemo = React.useMemo(() => {
  //     const handleClear = () => {
  //       if (filterText) {
  //         setResetPaginationToggle(!resetPaginationToggle);
  //         setFilterText("");
  //       }
  //     };
  //     return (
  //       <FilterComponent
  //         onFilter={(e) => setFilterText(e.target.value)}
  //         onClear={handleClear}
  //         filterText={filterText}
  //       />
  //     );
  //   }, [filterText, resetPaginationToggle]);

  const customStyles = {
    table: {
      style: {
        width: "100%",
        backgroundColor: "#f8f8f8",
        border: "1px solid lightgray",
      },
    },
    tableWrapper: {
      style: {
        width: "100%",
      },
    },
  };

  /** Get 2-letter initial from name or email */
  function getInitial(row: { user_name?: string; email?: string }): string {
    const name = (row.user_name ?? "").trim();
    if (name.length >= 2) return name.slice(0, 2).toUpperCase();
    if (name.length === 1) return name.toUpperCase();
    const email = (row.email ?? "").trim();
    if (email.length >= 2) return email.slice(0, 2).toUpperCase();
    return "—";
  }

  /** Display role label: buyer org -> AI Adoption prefix; vendor org -> T&SA prefix; system roles as-is. */
  function getRoleLabel(row: { role?: string; user_platform_role?: string }): string {
    const r = (row.role ?? row.user_platform_role ?? "").trim();
    if (!r) return "—";
    const platformRole = (row.user_platform_role ?? "").trim().toLowerCase();
    const roleLower = r.toLowerCase();

    const systemRoleMap: Record<string, string> = {
      "system admin": "System Admin",
      "system manager": "System Manager",
      "system viewer": "System Viewer",
      "system user": "System User",
      "ai directory curator": "AI Directory Curator",
    };
    if (systemRoleMap[platformRole] || systemRoleMap[roleLower]) {
      return systemRoleMap[platformRole] ?? systemRoleMap[roleLower] ?? r.replace(/\b\w/g, (c) => c.toUpperCase());
    }

    const vendorRoleMap: Record<string, string> = {
      admin: "T&SA Admin",
      manager: "T&SA Manager",
      lead: "T&SA Lead",
      engineer: "T&SA Engineer",
      viewer: "T&SA Viewer",
      analyst: "T&SA Lead",
      user: "T&SA Engineer",
    };
    const buyerRoleMap: Record<string, string> = {
      admin: "AI Adoption Admin",
      manager: "AI Adoption Manager",
      lead: "AI Adoption Lead",
      engineer: "AI Adoption Engineer",
      viewer: "AI Adoption Viewer",
      analyst: "AI Adoption Lead",
      user: "AI Adoption Engineer",
    };

    if (platformRole === "vendor") {
      return vendorRoleMap[roleLower] ?? r.replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (platformRole === "buyer") {
      return buyerRoleMap[roleLower] ?? r.replace(/\b\w/g, (c) => c.toUpperCase());
    }

    const defaultMap: Record<string, string> = {
      admin: "Org Admin",
      analyst: "Assessor",
      viewer: "Viewer",
      user: "User",
      manager: "Manager",
    };
    return defaultMap[roleLower] ?? r.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  const columns = [
    {
      name: <div className="tableHeader">User</div>,
      selector: (row) => (row.user_name && row.user_name.trim()) ? row.user_name : row.email ?? "—",
      sortable: true,
      cell: (row) => (
        <div className="team_member_user_cell">
          <span className="team_member_initial">{getInitial(row)}</span>
          <div className="team_member_name_email">
            <span className="team_member_name">{(row.user_name && row.user_name.trim()) ? row.user_name : "—"}</span>
            {row.email ? (
              <a href={`mailto:${row.email}`} className="team_member_email team_member_email_link">
                {row.email}
              </a>
            ) : (
              <span className="team_member_email">—</span>
            )}
          </div>
        </div>
      ),
    },
    {
      name: <div className="tableHeader">Organization</div>,
      selector: (row) => (row.organization_name ?? "").trim() || "—",
      sortable: true,
      cell: (row) => (
        <span className="team_member_org">{(row.organization_name ?? "").trim() || "—"}</span>
      ),
    },
    {
      name: <div className="tableHeader">Role</div>,
      selector: (row) => getRoleLabel(row),
      sortable: true,
      cell: (row) => (
        <span className="pill pill_role pill_role_with_icon">
          <Shield size={14} aria-hidden />
          {getRoleLabel(row)}
        </span>
      ),
    },
    {
      name: <div className="tableHeader">Account status</div>,
      selector: (row) => {
        const accountStatus = (row.account_status ?? "invited").toString().toLowerCase();
        const onboardingStatus = (row.onboarding_status ?? "pending").toString().toLowerCase();
        if (accountStatus === "expired" || (accountStatus === "invited" && onboardingStatus === "expired")) return "expired";
        return accountStatus;
      },
      sortable: true,
      center: true,
      cell: (row) => {
        const accountStatus = (row.account_status ?? "invited").toString().toLowerCase();
        const onboardingStatus = (row.onboarding_status ?? "pending").toString().toLowerCase();
        const isExpired = accountStatus === "expired" || (accountStatus === "invited" && onboardingStatus === "expired");
        const isConfirmed = accountStatus === "confirmed";
        const label = isConfirmed ? "Confirmed" : isExpired ? "Expired" : "Invited";
        const pillClass = isConfirmed ? "pill_status_active" : isExpired ? "pill_status_inactive" : "pill_status_invited";
        return (
          <span className={`pill pill_status ${pillClass}`}>
            {label}
          </span>
        );
      },
    },
    {
      name: <div className="tableHeader">Onboarding status</div>,
      selector: (row) => (row.onboarding_status ?? "pending").toString().toLowerCase(),
      sortable: true,
      center: true,
      cell: (row) => {
        const status = (row.onboarding_status ?? "pending").toString().toLowerCase();
        const isCompleted = status === "completed";
        const isExpired = status === "expired";
        const pillClass = isCompleted
          ? "pill_status_active"
          : isExpired
            ? "pill_status_inactive"
            : "pill_status_pending";
        const label = status === "completed" ? "Completed" : status === "expired" ? "Expired" : "Pending";
        return (
          <span className={`pill pill_status ${pillClass}`}>
            {label}
          </span>
        );
      },
    },
    {
      name: <div className="tableHeader">Status</div>,
      selector: (row) => (row.userStatus ?? "active").toString().toLowerCase(),
      sortable: true,
      center: true,
      cell: (row) => {
        const status = (row.userStatus ?? "active").toString().toLowerCase();
        const isActive = status === "active";
        return (
          <span className={`pill pill_status ${isActive ? "pill_status_active" : "pill_status_inactive"}`}>
            {isActive ? "Active" : "Inactive"}
          </span>
        );
      },
    },
    {
      name: <div className="tableHeader">Actions</div>,
      center: true,
      cell: (row) => {
        const accountStatus = (row.account_status ?? "invited").toString().toLowerCase();
        const onboardingStatus = (row.onboarding_status ?? "pending").toString().toLowerCase();
        const signupCompleted = (row.user_signup_completed ?? "").toString().toLowerCase() === "true";
        const isExpiredStatus = accountStatus === "expired";
        const isInvitedStatus = accountStatus === "invited";
        const currentUserId = sessionStorage.getItem("userId") ?? "";
        const isCurrentUser = currentUserId !== "" && String(row.id) === String(currentUserId);
        // Edit only when confirmed and not the current user (users cannot edit their own row in the table). Disabled when viewOnly.
        const editEnabled = !viewOnly && accountStatus === "confirmed" && !isCurrentUser;
        // Reinvite only when expired; disabled when invited or viewOnly.
        const reinviteEnabled = !viewOnly && isExpiredStatus;
        // Resend onboarding only when signup completed and onboarding link expired; when account is expired, only reinvite/view. Disabled when viewOnly.
        const resendOnboardingEnabled =
          !viewOnly && !isExpiredStatus && signupCompleted && onboardingStatus === "expired";
        return (
          <div className="user_table_actions">
            <button
              type="button"
              className="user_table_action_btn user_table_action_btn_icon"
              onClick={() => setViewUser(row)}
              title="View"
              aria-label="View user details"
            >
              <Eye size={16} />
            </button>
            {!viewOnly && (
              <>
                <button
                  type="button"
                  className="user_table_action_btn user_table_action_btn_icon"
                  onClick={() => editEnabled && updateUser(row)}
                  title="Edit"
                  aria-label="Edit user"
                  disabled={!editEnabled}
                  aria-disabled={!editEnabled}
                >
                  <SquarePen size={16} />
                </button>
                <button
                  type="button"
                  className="user_table_action_btn user_table_action_btn_icon"
                  onClick={() => reinviteEnabled && openReinviteConfirm(row)}
                  title="Re-Invite"
                  aria-label="Resend signup link"
                  disabled={!reinviteEnabled}
                  aria-disabled={!reinviteEnabled}
                >
                  <Send size={16} />
                </button>
                <button
                  type="button"
                  className="user_table_action_btn user_table_action_btn_icon"
                  onClick={() => resendOnboardingEnabled && openResendOnboardingConfirm(row)}
                  title="Resend - Onboarding"
                  aria-label="Resend onboarding"
                  disabled={!resendOnboardingEnabled}
                  aria-disabled={!resendOnboardingEnabled}
                >
                  <RefreshCw size={16} />
                </button>
              </>
            )}
          </div>
        );
      },
      ignoreRowClick: true,
      minWidth: "180px",
      width: "180px",
    },
  ];

  return (
    <>
    <div className="orgDataTable">
      <div className="user_management_search_row">
        <div className="user_management_search_wrap">
          <Search size={18} className="user_management_search_icon" aria-hidden />
          <input
            className="user_management_search_input"
            type="search"
            id="user-search"
            placeholder="Filter by name, email, organization, role…"
            aria-label="Search users"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      {loading ? (
        <LoadingMessage message="Loading users…" />
      ) : (
        <DataTable
          customStyles={customStyles}
          columns={columns}
          data={filteredItems}
          pagination
          paginationResetDefaultPage={resetPaginationToggle}
          selectableRows
          persistTableHead
        />
      )}
    </div>
    {isEdit && (
      <EditUsers isUserId={isUserId} setIsEdit={setIsEdit} isEdit={isEdit} isSelectedUser={isSelectedUser} />
    )}

    <Modal isOpen={!!resendConfirm} onClose={closeResendConfirm}>
      {resendConfirm && (
        <div className="user_view_modal_content resend_confirm_modal">
          <div className="user_view_modal_header">
            <h2 className="user_view_modal_title">
              {resendConfirm.type === "reinvite" ? "Resend signup link" : "Resend onboarding link"}
            </h2>
            <button
              type="button"
              className="modal_close_btn"
              onClick={closeResendConfirm}
              aria-label="Close"
              disabled={resendSending}
            >
              <CircleX size={20} />
            </button>
          </div>
          <p className="resend_confirm_message">
            {resendConfirm.type === "reinvite"
              ? `Send a new signup link to ${resendConfirm.user.email ?? "this user"}?`
              : `Send a new onboarding link to ${resendConfirm.user.email ?? "this user"}?`}
          </p>
          <div className="fields_for_button_actions orgBtns user_view_modal_footer">
            <Button
              type="button"
              className="orgCancelBtn"
              onClick={closeResendConfirm}
              disabled={resendSending}
            >
              <Ban size={16} />
              Cancel
            </Button>
            <Button
              type="button"
              className="orgCreateBtn"
              onClick={executeResend}
              disabled={resendSending}
              aria-busy={resendSending}
            >
              <Send size={16} />
              {resendSending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </Modal>

    {viewUser && (
      <div
        className="profile_modal_overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user_details_modal_title"
        onClick={(e) => {
          if (e.target === e.currentTarget) setViewUser(null);
        }}
      >
        <div className="profile_modal_content" onClick={(e) => e.stopPropagation()}>
          <div className="profile_modal_header">
            <h2 id="user_details_modal_title" className="profile_modal_title">
              User details
            </h2>
            <button
              type="button"
              className="modal_close_btn"
              onClick={() => setViewUser(null)}
              aria-label="Close"
            >
              <CircleX size={20} />
            </button>
          </div>
          <div className="profile_modal_body profile_modal_preview">
            <div className="profile_form_sections">
              <section className="profile_form_section">
                <div className="settings_form">
                  <div className="settings_form_row">
                    <div className="settings_form_group">
                      <label htmlFor="user_details_name">
                        <User size={16} aria-hidden />
                        Name
                      </label>
                      <input
                        id="user_details_name"
                        type="text"
                        className="settings_input settings_input_readonly"
                        value={(viewUser.user_name && viewUser.user_name.trim()) ? viewUser.user_name : "—"}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                    <div className="settings_form_group">
                      <label htmlFor="user_details_email">
                        <Mail size={16} aria-hidden />
                        Email
                      </label>
                      <input
                        id="user_details_email"
                        type="text"
                        className="settings_input settings_input_readonly"
                        value={viewUser.email ?? "—"}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </div>
                  <div className="settings_form_row">
                    <div className="settings_form_group">
                      <label htmlFor="user_details_organization">
                        <Landmark size={16} aria-hidden />
                        Organization
                      </label>
                      <input
                        id="user_details_organization"
                        type="text"
                        className="settings_input settings_input_readonly"
                        value={(viewUser.organization_name ?? "").trim() || "—"}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                    <div className="settings_form_group">
                      <label htmlFor="user_details_role">
                        <UserStar size={16} aria-hidden />
                        Role
                      </label>
                      <input
                        id="user_details_role"
                        type="text"
                        className="settings_input settings_input_readonly"
                        value={getRoleLabel(viewUser)}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </div>
                  <div className="settings_form_row">
                    <div className="settings_form_group">
                      <label htmlFor="user_details_account_status">
                        <UserCheck size={16} aria-hidden />
                        Account status
                      </label>
                      <input
                        id="user_details_account_status"
                        type="text"
                        className="settings_input settings_input_readonly"
                        value={(() => {
                          const acc = (viewUser.account_status ?? "invited").toString().toLowerCase();
                          const onb = (viewUser.onboarding_status ?? "pending").toString().toLowerCase();
                          if (acc === "confirmed") return "Confirmed";
                          if (acc === "expired" || (acc === "invited" && onb === "expired")) return "Expired";
                          return "Invited";
                        })()}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                    <div className="settings_form_group">
                      <label htmlFor="user_details_onboarding_status">
                        <ClipboardCheck size={16} aria-hidden />
                        Onboarding status
                      </label>
                      <input
                        id="user_details_onboarding_status"
                        type="text"
                        className="settings_input settings_input_readonly"
                        value={
                          (viewUser.onboarding_status ?? "pending").toString().toLowerCase() === "completed"
                            ? "Completed"
                            : (viewUser.onboarding_status ?? "pending").toString().toLowerCase() === "expired"
                              ? "Expired"
                              : "Pending"
                        }
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </div>
                  <div className="settings_form_row">
                    <div className="settings_form_group">
                      <label htmlFor="user_details_status">
                        <Shield size={16} aria-hidden />
                        Status
                      </label>
                      <input
                        id="user_details_status"
                        type="text"
                        className="settings_input settings_input_readonly"
                        value={(viewUser.userStatus ?? "active").toString().toLowerCase() === "active" ? "Active" : "Inactive"}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
            <div className="profile_modal_footer profile_modal_footer_center">
              <Button
                type="button"
                className="orgCancelBtn"
                onClick={() => setViewUser(null)}
                aria-label="Close"
              >
                <CircleX size={16} aria-hidden />
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default UserDataTable;

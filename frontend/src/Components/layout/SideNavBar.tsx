import { useState, useEffect } from "react";
import { NAVIGATION } from "../../constants/navConfig"; // the list of side navigation bar
import { NavLink, useLocation, useMatch } from "react-router-dom";
import { Shield, User2Icon, UserCircle, UserCircle2 } from "lucide-react";
import { normalizeSystemRole, isPathAllowedForUserRole } from "../../guards/rbacConfig";
import type { SystemRole } from "../../guards/rbacConfig";
import "../../styles/layout/sideNav.css";
import aiQLogo  from "../../assets/images/mainLogo/new_logo/ai_q_logo_gray.png";

const ASSESSMENT_PATHS = ["/assessments", "/vendorcots", "/buyerAssessment"];
const isAssessmentArea = (pathname: string) =>
  ASSESSMENT_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

const isAttestationArea = (pathname: string) =>
  pathname === "/attestation_details" ||
  pathname.startsWith("/attestation_details/") ||
  pathname.startsWith("/vendorSelfAttestation");

const SideNavBar = () => {
  const location = useLocation();
  const reportsLibraryMatch = useMatch({ path: "/reports/*" });
  const isReportsNavActive =
    location.pathname === "/reports" ||
    reportsLibraryMatch != null ||
    location.pathname.startsWith("/buyer-vendor-risk-report/");
  const [, setProfileRefresh] = useState(0);
  useEffect(() => {
    const onProfileUpdated = () => setProfileRefresh((n) => n + 1);
    window.addEventListener("userProfileUpdated", onProfileUpdated);
    return () => window.removeEventListener("userProfileUpdated", onProfileUpdated);
  }, []);
  const rawSystemRole = sessionStorage.getItem("systemRole") ?? "";
  const rawUserRole = sessionStorage.getItem("userRole") ?? "";
  const normalizedSystemRole = normalizeSystemRole(rawSystemRole) as SystemRole | "";

  // Only show nav items for routes this role is allowed to access (same rules as RBACGuard).
  // e.g. vendor lead does not see User Management; only admin/manager do.
  const navItems = NAVIGATION.admin.filter((item) =>
    isPathAllowedForUserRole(item.path, normalizedSystemRole, rawUserRole)
  );

  const seenPaths = new Set<string>();
  const navItemsDeduped = navItems.filter((item) => {
    if (seenPaths.has(item.path)) return false;
    seenPaths.add(item.path);
    return true;
  });

  const portalLabel =
    normalizedSystemRole === "vendor"
      ? "VENDOR PORTAL"
      : normalizedSystemRole === "buyer"
        ? "ORGANIZATION PORTAL"
        : null;

  const footerLabel =
    normalizedSystemRole === "vendor"
      ? "MY VENDOR"
      : normalizedSystemRole === "buyer"
        ? "MY BUYER"
        : "ACCOUNT";

  const displayName =
    [sessionStorage.getItem("userFirstName"), sessionStorage.getItem("userLastName")]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    (sessionStorage.getItem("userName") ?? "").trim() ||
    "User";
  const email = (sessionStorage.getItem("userEmail") ?? "").trim() || "";
  const initials = (() => {
    const first = (sessionStorage.getItem("userFirstName") ?? "").trim();
    const last = (sessionStorage.getItem("userLastName") ?? "").trim();
    if (first && last) return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
    if (first) return first.slice(0, 2).toUpperCase();
    const un = (sessionStorage.getItem("userName") ?? "").trim();
    if (un.length >= 2) return un.slice(0, 2).toUpperCase();
    if (un.length === 1) return un.toUpperCase();
    if (email) return email.slice(0, 2).toUpperCase();
    return "UN";
  })();

  return (
    <>
      <div className="side_nav_header">
         <NavLink to="/">
          <div className="side_nav_logo_icon">
            <img src={aiQLogo} alt="aiQLogo" />
          </div>
          <div className="side_nav_title">
            <h3 className="side_nav_logo_text">AI-Q</h3>
            <p className="side_nav_logo_tagline">Enterprise AI Governance Platform</p>
          </div>
        </NavLink>
      </div>
      <div className="side_nav_content">
      {/* {portalLabel && (
        <p
          className="side_nav_portal_label"
          aria-label={`Portal: ${portalLabel}`}
        >
          {portalLabel}
        </p>
      )} */}
      <ul className="side_nav_list">
        {navItemsDeduped.map((item) => {
          const Icon = item.icon;
          const isAssessmentsItem = item.path === "/assessments";
          const isAttestationItem = item.path === "/attestation_details";
          const isReportsItem = item.path === "/reports";
          const showActive =
            (isAssessmentsItem && isAssessmentArea(location.pathname)) ||
            (isAttestationItem && isAttestationArea(location.pathname)) ||
            (isReportsItem && isReportsNavActive);
          return (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  ["side_nav_link", showActive || isActive ? "active" : ""]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                <span className="side_nav_icon">
                  <Icon size={18} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
      {portalLabel && (
        
        <p
        
          className="side_nav_portal_label"
          aria-label={`Portal: ${portalLabel}`}
        >
              < User2Icon width={16}/>
          {portalLabel}
        </p>
      )}
      {/* <div className="side_nav_footer">
        <p className="side_nav_footer_label" aria-label={`Section: ${footerLabel}`}>
          {footerLabel}
        </p>
        <div className="side_nav_user_card">
          <div className="side_nav_user_avatar">{initials}</div>
          <div className="side_nav_user_info">
            <span className="side_nav_user_name">{displayName}</span>
            {email && (
              <span className="side_nav_user_email">{email}</span>
            )}
          </div>
        </div>
      </div> */}
      </div>
    </>
  );
};

export default SideNavBar;

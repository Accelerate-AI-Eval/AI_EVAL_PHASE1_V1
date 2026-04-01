import { LogOutIcon, Loader2, User } from "lucide-react";
import UserPopup from "../../UI/UserPopup";
import "../../../styles/popovers.css";
import "../VendorOnboarding/StepVendorOnboardingPreview.css";
import "./user_profile.css";
import Button from "../../UI/Button";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

type UserProfileProps = {
  onClose?: () => void;
};

const UserProfile = ({ onClose }: UserProfileProps) => {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const BASE_URL = import.meta.env.VITE_BASE_URL;

  const LOGOUT_SPINNER_MIN_MS = 2500; // 2.5 seconds so spinner is visible 2–3s

  const logout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoggingOut(true);
    const startTime = Date.now();

    const token = sessionStorage.getItem("bearerToken");

    try {
      const response = await fetch(`${BASE_URL}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result) {
          sessionStorage.removeItem("bearerToken");
          sessionStorage.removeItem("userEmail");
          sessionStorage.removeItem("userRole");
          sessionStorage.removeItem("userId");
          sessionStorage.removeItem("systemRole");
          sessionStorage.removeItem("user_signup_completed");
          sessionStorage.removeItem("user_onboarding_completed");
          // Keep spinner visible for at least 2–3 seconds before redirecting
          const elapsed = Date.now() - startTime;
          const remaining = Math.max(0, LOGOUT_SPINNER_MIN_MS - elapsed);
          await new Promise((r) => setTimeout(r, remaining));
          navigate("/login");
          return;
        }
      }
    } catch (err) {
      console.log("Request failed: ", err);
    }

    // Ensure spinner shows for at least 2–3s before re-enabling button on error
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, LOGOUT_SPINNER_MIN_MS - elapsed);
    await new Promise((r) => setTimeout(r, remaining));
    setIsLoggingOut(false);
  };

  const goMyAccount = () => {
    onClose?.();
    navigate("/account");
  };

  return (
    <UserPopup className="user_popup">
      {/*
      <div className="user_popup_account_header">
        <UserCircle
          size={18}
          className="user_popup_account_icon"
          aria-hidden
        />
        <h5 className="user_popup_account_title">Account</h5>
      </div>
      */}

      <ul>
        {/* Role, Profile, and Settings menu items removed; account details are on the My Account page. */}
        <li
          role="button"
          tabIndex={0}
          onClick={goMyAccount}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              goMyAccount();
            }
          }}
        >
          <span>
            <User />
          </span>
          <span>My Account</span>
        </li>
      </ul>

      <Button
        className={`logout_btn ${isLoggingOut ? "auth_btn_loading" : ""}`}
        onClick={logout}
        disabled={isLoggingOut}
        aria-busy={isLoggingOut}
      >
        {isLoggingOut ? (
          <>
            <Loader2
              className="auth_spinner"
              size={18}
              color="white"
              aria-hidden
            />
            Logging out…
          </>
        ) : (
          <>
            <span>
              <LogOutIcon color="white" />
            </span>
            Logout
          </>
        )}
      </Button>
    </UserPopup>
  );
};

export default UserProfile;

import { useState } from "react";
import { toast } from "react-toastify";
import { Eye, EyeOff, CheckCircle, Loader2, LogIn, User, Lock, MoveRightIcon } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AuthShell } from "../AuthShell";

const Login = () => {
  document.title = "AI-Q Platform | Sign in";

  const BASE_URL =
    import.meta.env.VITE_BASE_URL;
  const navigate = useNavigate();
  const location = useLocation();
  const resetSuccess = (location.state as { resetSuccess?: boolean } | null)
    ?.resetSuccess;
  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isUser, setIsUser] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  const getUser = async (e: any) => {
    e.preventDefault();
    setIsLoading(true);

    const data = {
      email: emailOrUsername.trim(),
      password,
    };
    // console.log(data);

    try {
      const response = await fetch(`${BASE_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      const text = await response.text();
      let result: {
        token?: string;
        userDetails?: unknown[];
        message?: string;
      } = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        toast.error(
          response.ok
            ? "Invalid response from server"
            : "Server error. Check that the API is running.",
          { autoClose: 4000 },
        );
        setIsLoading(false);
        return;
      }
      if (response.ok) {
        const bearerToken = result.token;
        const userDetails = result.userDetails?.[0];
        if (!userDetails || !bearerToken) {
          toast.error("Invalid response from server", { autoClose: 4000 });
          setIsLoading(false);
          return;
        }
        setIsUser(userDetails);
        sessionStorage.setItem("bearerToken", bearerToken);
        sessionStorage.setItem("userEmail", userDetails.email ?? "");
        sessionStorage.setItem(
          "userRole",
          userDetails.role != null ? String(userDetails.role).trim() : "",
        );
        sessionStorage.setItem("userId", String(userDetails.id ?? ""));
        sessionStorage.setItem(
          "organizationName",
          String(userDetails.organization_name ?? "").trim(),
        );
        sessionStorage.setItem(
          "organizationId",
          String(userDetails.organization_id ?? userDetails.organization_name ?? "").trim(),
        );
        sessionStorage.setItem(
          "userName",
          String(userDetails.user_name ?? "").trim(),
        );
        sessionStorage.setItem(
          "userFirstName",
          String(userDetails.user_first_name ?? "").trim(),
        );
        sessionStorage.setItem(
          "userLastName",
          String(userDetails.user_last_name ?? "").trim(),
        );
        const platformRole = userDetails.user_platform_role;
        sessionStorage.setItem(
          "systemRole",
          platformRole != null && platformRole !== ""
            ? String(platformRole).trim()
            : "",
        );
        sessionStorage.setItem(
          "user_signup_completed",
          String(userDetails.user_signup_completed ?? "false"),
        );
        sessionStorage.setItem(
          "user_onboarding_completed",
          String(userDetails.user_onboarding_completed ?? "false"),
        );
        setLoginSuccess(true);
        toast.success("Login successful!", { autoClose: 2000 });
        const nextPath =
          userDetails.user_onboarding_completed === true ||
          userDetails.user_onboarding_completed === "true"
            ? "/dashboard"
            : "/onBoarding";
        setTimeout(() => navigate(nextPath), 2000);
      } else {
        setIsLoading(false);
        const msg = (result.message ?? "").toLowerCase();
        const isInvited =
          msg.includes("invited") ||
          result.code === "invited";
        const isInactive =
          result.code === "inactive" || msg.includes("inactive");
        const isUserNotFound =
          msg.includes("user not found") ||
          msg.includes("no user") ||
          msg.includes("invalid email") ||
          msg.includes("account not found");
        if (isInvited) {
          toast.error(
            "This account was invited. Please complete signup from your invitation email.",
            { autoClose: 5000 },
          );
        } else if (isInactive) {
          toast.error(
            "This account is inactive. Contact your administrator.",
            { autoClose: 5000 },
          );
        } else if (isUserNotFound) {
          toast.error("User not found.", { autoClose: 4000 });
        } else {
          toast.error(
            result.message ||
              "Login failed. Check your email/username and password.",
            { autoClose: 4000 },
          );
        }
      }
    } catch (error) {
      console.log(error);
      toast.error("Something went wrong. Please try again.", {
        autoClose: 4000,
      });
      setIsLoading(false);
    }
  };

  const passwordVisible = () => {
    setIsVisible((prev) => !prev);
  };

  const isDisabledBtn = !emailOrUsername.trim() || !password.trim() || isLoading || loginSuccess;

  return (
    <AuthShell
      title="Sign in"
      // subtitle="Enter your credentials to access the Governance Ledger"
    >
      <form action="" autoComplete="off" onSubmit={getUser}>
                  <div className="emailData emailData--signin">
                    <label
                      htmlFor="loginEmail"
                      className="signin-field-label signin-field-label--inline"
                    >
                      <User
                        className="signin-field-label__icon"
                        size={24}
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span>Email / username</span>
                    </label>
                    <input
                      type="text"
                      id="loginEmail"
                      className="signin-input"
                      autoComplete="username"
                      value={emailOrUsername}
                      onChange={(e) => setEmailOrUsername(e.target.value)}
                      placeholder="Email or Username"
                    />
                  </div>
                  <div className="passwordData passwordData--signin">
                    <div className="signin-label-row">
                      <label
                        htmlFor="loginPassword"
                        className="signin-field-label signin-field-label--inline"
                      >
                        <Lock
                          className="signin-field-label__icon"
                          size={24}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span>Password</span>
                      </label>
                      <Link
                        to="/forgotPassword"
                        className="signin-forgot-link"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="signin-input-wrap">
                      <input
                        type={isVisible ? "text" : "password"}
                        id="loginPassword"
                        className="signin-input"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        className="signin-eye"
                        onClick={passwordVisible}
                        aria-label={
                          isVisible ? "Hide password" : "Show password"
                        }
                      >
                        {isVisible ? (
                          <Eye size={18} strokeWidth={1.75} />
                        ) : (
                          <EyeOff size={18} strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </div>
                  {resetSuccess && (
                    <div className="authMessage authMessage--success signin-flash">
                      <CheckCircle
                        className="authMessage__icon"
                        size={16}
                        aria-hidden
                      />
                      <p className="loginSuccess">
                        Password reset successfully. You can sign in with your
                        new password.
                      </p>
                    </div>
                  )}
                  <div className="loginBtn loginBtn--signin">
                    <button
                      type="submit"
                      className={`login-btn signin-submit ${isDisabledBtn ? "disabled_css" : ""} ${isLoading || loginSuccess ? "auth_btn_loading" : ""}`}
                      disabled={isDisabledBtn}
                      aria-busy={isLoading || loginSuccess}
                    >
                      {loginSuccess ? (
                        <>
                          Signing in…
                          <Loader2
                            className="auth_spinner"
                            size={20}
                            aria-hidden
                          />
                        </>
                      ) : isLoading ? (
                        <>
                          <Loader2
                            className="auth_spinner"
                            size={20}
                            aria-hidden
                          />
                        </>
                      ) : (
                        <>
                          Sign in
                          <MoveRightIcon
                            className="signin-submit__icon"
                            size={20}
                            strokeWidth={2}
                            aria-hidden
                          />
                        </>
                      )}
                    </button>
                  </div>
      </form>
    </AuthShell>
  );
};

export default Login;

import { useEffect, useState, useMemo } from "react";
import { toast } from "react-toastify";
import { Eye, EyeOff, Loader2, KeyRound, Mail, Lock, ArrowRight, MoveRightIcon } from "lucide-react";
import { jwtDecode } from "jwt-decode";
import "./resetPassword.css";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { AuthShell } from "../AuthShell";

interface ResetTokenPayload {
  email?: string;
  purpose?: string;
  exp?: number;
}

const ResetPassword = () => {
  useEffect(() => {
    document.title = "AI-Q Platform | Reset Password";
  }, []);

  const BASE_URL = (import.meta.env.VITE_BASE_URL ?? "").toString().trim();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const decodedToken = useMemo(() => {
    if (!token) return null;
    try {
      return jwtDecode<ResetTokenPayload>(token);
    } catch {
      return null;
    }
  }, [token]);

  const emailFromToken = decodedToken?.email ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [isVisibleConfirm, setIsVisibleConfirm] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success">(
    "idle",
  );

  const passwordVisible = () => setIsVisible((prev) => !prev);
  const confirmPasswordVisible = () => setIsVisibleConfirm((prev) => !prev);

  const isInvalidLink = !token || !decodedToken || !emailFromToken;

  useEffect(() => {
    if (!isInvalidLink) return;
    toast.error(
      "Invalid or expired reset link. Use the link from your email or request a new one from Forgot password.",
      { autoClose: 5000 },
    );
  }, [isInvalidLink]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!token) {
      toast.error("Invalid or expired reset link.", { autoClose: 4000 });
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.", {
        autoClose: 4000,
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.", { autoClose: 4000 });
      return;
    }

    setStatus("loading");

    try {
      const response = await fetch(`${BASE_URL}/resetPassword`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
          email: (emailFromToken ?? "").toString().trim().toLowerCase(),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setStatus("success");
        toast.success(data.message || "Password reset successfully.", {
          autoClose: 2000,
        });
        setTimeout(
          () => navigate("/login", { state: { resetSuccess: true } }),
          2000,
        );
      } else {
        setStatus("idle");
        toast.error(
          data.message || "Something went wrong. Please try again.",
          { autoClose: 4000 },
        );
      }
    } catch {
      setStatus("idle");
      toast.error("Unable to connect. Please try again later.", {
        autoClose: 4000,
      });
    }
  };

  if (isInvalidLink) {
    return (
      <AuthShell title="Invalid link">
        <div className="auth-shell-centered">
          <p className="resetError">
            Please use the link from your email or{" "}
            <Link to="/forgotPassword" className="signin-forgot-link">
              request a new reset link
            </Link>
            .
          </p>
          <div className="loginBtn loginBtn--signin">
            <Link to="/login" className="login-btn signin-submit">
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset Password"
      subtitle="Reset your password to regain access to your account."
    >
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="emailData emailData--signin">
          <label
            htmlFor="resetEmail"
            className="signin-field-label signin-field-label--inline"
          >
            <Mail
              className="signin-field-label__icon"
              size={24}
              strokeWidth={2}
              aria-hidden
            />
            <span>Account email (from reset link)</span>
          </label>
          <input
            id="resetEmail"
            type="email"
            className="signin-input signin-input--readonly"
            value={emailFromToken}
            readOnly
            tabIndex={-1}
            aria-readonly
          />
        </div>
        <div className="passwordData passwordData--signin">
          <label
            htmlFor="newPassword"
            className="signin-field-label signin-field-label--inline"
          >
            <Lock
              className="signin-field-label__icon"
              size={24}
              strokeWidth={2}
              aria-hidden
            />
            <span>New password</span>
          </label>
          <div className="signin-input-wrap">
            <input
              id="newPassword"
              type={isVisible ? "text" : "password"}
              className="signin-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              maxLength={128}
              minLength={8}
              placeholder="At least 8 characters"
              disabled={status === "loading" || status === "success"}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="signin-eye"
              onClick={passwordVisible}
              aria-label={isVisible ? "Hide password" : "Show password"}
            >
              {isVisible ? (
                <Eye size={18} strokeWidth={1.75} />
              ) : (
                <EyeOff size={18} strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
        <div className="passwordData passwordData--signin">
          <label
            htmlFor="confirmPassword"
            className="signin-field-label signin-field-label--inline"
          >
            <Lock
              className="signin-field-label__icon"
              size={24}
              strokeWidth={2}
              aria-hidden
            />
            <span>Confirm password</span>
          </label>
          <div className="signin-input-wrap">
            <input
              id="confirmPassword"
              type={isVisibleConfirm ? "text" : "password"}
              className="signin-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              maxLength={128}
              placeholder="Confirm new password"
              disabled={status === "loading" || status === "success"}
              autoComplete="new-password"
            />
            <button
              type="button"
              className="signin-eye"
              onClick={confirmPasswordVisible}
              aria-label={isVisibleConfirm ? "Hide password" : "Show password"}
            >
              {isVisibleConfirm ? (
                <Eye size={18} strokeWidth={1.75} />
              ) : (
                <EyeOff size={18} strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
        <div className="loginBtn loginBtn--signin">
          <button
            type="submit"
            className={`login-btn signin-submit ${
              status === "loading" ||
              status === "success" ||
              !newPassword ||
              !confirmPassword
                ? "disabled_css"
                : ""
            } ${status === "loading" ? "auth_btn_loading" : ""}`}
            disabled={
              status === "loading" ||
              status === "success" ||
              !newPassword ||
              !confirmPassword
            }
            aria-busy={status === "loading"}
          >
            {status === "loading" ? (
              <>
                Resetting…
                <Loader2 className="auth_spinner" size={20} aria-hidden />
              </>
            ) : status === "success" ? (
              <>Success — redirecting…</>
            ) : (
              <>
                Confirm
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
        <p className="signinText signin-auth-footer">
          Remember your password?{" "}
          <Link to="/login">
            <span>Sign in</span>
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};

export default ResetPassword;

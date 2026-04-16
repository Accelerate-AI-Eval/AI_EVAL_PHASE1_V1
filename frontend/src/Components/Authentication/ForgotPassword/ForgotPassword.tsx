import { useState } from "react";
import { toast } from "react-toastify";
import { Loader2, Send, Mail, MoveRightIcon } from "lucide-react";
import "./forgotPassword.css";
import { Link } from "react-router-dom";
import { AuthShell } from "../AuthShell";

const ForgotPassword = () => {
  document.title = "AI-Q Platform | Forgot Password";

  const BASE_URL = (import.meta.env.VITE_BASE_URL ?? "").toString().trim();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your email address.", { autoClose: 4000 });
      return;
    }

    setStatus("loading");

    try {
      const response = await fetch(`${BASE_URL}/forgotPassword`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
      };

      if (response.ok) {
        setStatus("success");
        toast.success(
          data.message ||
            "Check your inbox for a link to reset your password.",
          { autoClose: 5000 },
        );
        return;
      }

      setStatus("idle");
      if (response.status === 404) {
        toast.error(
          data.message || "No account found with this email address.",
          { autoClose: 5000 },
        );
        return;
      }
      toast.error(
        data.message || "Something went wrong. Please try again.",
        { autoClose: 4000 },
      );
    } catch {
      setStatus("idle");
      toast.error("Unable to connect. Please try again later.", {
        autoClose: 4000,
      });
    }
  };

  return (
    <AuthShell
      title="Forgot Password"
      subtitle="Enter your registered email to receive a password reset link."
    >
      <form onSubmit={handleSubmit} autoComplete="off">
        <div className="emailData emailData--signin">
          <label
            htmlFor="forgotEmail"
            className="signin-field-label signin-field-label--inline"
          >
            <Mail
              className="signin-field-label__icon"
              size={24}
              strokeWidth={2}
              aria-hidden
            />
            <span>Email</span>
          </label>
          <input
            id="forgotEmail"
            type="email"
            className="signin-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            disabled={status === "loading"}
          />
        </div>
        <div className="loginBtn loginBtn--signin">
          <button
            type="submit"
            className={`login-btn signin-submit ${!email.trim() || status === "loading" ? "disabled_css" : ""} ${status === "loading" ? "auth_btn_loading" : ""}`}
            disabled={!email.trim() || status === "loading"}
            aria-busy={status === "loading"}
          >
            {status === "loading" ? (
              <>
                Sending…
                <Loader2 className="auth_spinner" size={20} aria-hidden />
              </>
            ) : (
              <>
                Submit
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
          Remember your credentials?{" "}
          <Link to="/login">
            <span>Sign in</span>
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};

export default ForgotPassword;

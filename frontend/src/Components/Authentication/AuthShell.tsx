import type { ReactNode } from "react";
import "./Login/login.css";
// import signinLogo from "../../assets/images/mainLogo/new_logo/ai_q_logo_gray.png";
import signinLogo from "../../assets/images/mainLogo/new_logo/ai_q_logo_blue.png";

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Wide card for multi-column forms (e.g. sign up) */
  variant?: "default" | "wide";
}

export function AuthShell({
  title,
  subtitle,
  children,
  variant = "default",
}: AuthShellProps) {
  const isWide = variant === "wide";

  return (
    <div className="authPage authPage--signin">
      <div
        className={`authContent authContent--signin ${isWide ? "authContent--signin-wide" : ""}`}
      >
        <div className="loginData loginData--signin">
          <div className="loginCred loginCred--signin">
            <div
              className={`loginForm loginForm--signin ${isWide ? "loginForm--signin-wide" : ""}`}
            >
              <div className="signin-heading-block">
                <div className="signin-brand">
                  <img
                    src={signinLogo}
                    alt="AI Eval"
                    className="signin-logo"
                    width={56}
                    height={56}
                  />
                </div>
                <h1 className="signin-title">{title}</h1>
                {subtitle ? (
                  <p className="signin-subtitle">{subtitle}</p>
                ) : null}
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

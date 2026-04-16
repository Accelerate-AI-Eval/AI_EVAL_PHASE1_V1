import {
  ArrowRight,
  UserPlus,
  Eye,
  EyeOff,
  CheckCircle,
  Loader2,
  Mail,
  User,
  UserCircle,
  Lock,
  MoveRightIcon,
} from "lucide-react";
import "../../../styles/card.css";
import "../ResetPassword/resetPassword.css";
import "../../pages/UserProfile/user_profile.css";
import "../../../styles/popovers.css";
import "./signup.css";
import { useEffect, useState } from "react";
import type { SignUpdata } from "../Validations/sign_up_validations";
import { useNavigate, useParams, Link } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { AuthShell } from "../AuthShell";

const SignUp = () => {
  useEffect(() => {
    document.title = "AI-Q Platform | Sign Up";
  }, []);
  const BASE_URL = import.meta.env.VITE_BASE_URL;

  const [isVisibleConfirm, setIsVisibleConfirm] = useState(false);
  const navigate = useNavigate();
  const { token } = useParams();
  const [isVisible, setIsVisible] = useState(false);
  const [isConfirmSignup, setIsConfirmSignup] = useState(false);
  const [onboardingEmailSent, setOnboardingEmailSent] = useState(false);
  const [isError, setIsError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);

  const decode = (() => {
    if (!token) return null;
    try {
      return jwtDecode<{ email?: string; exp?: number }>(token);
    } catch {
      return null;
    }
  })();

  const decodeEmail = decode?.email ?? "";

  useEffect(() => {
    if (!token) {
      setLinkExpired(true);
      return;
    }
    try {
      const d = jwtDecode<{ exp?: number }>(token);
      if (d.exp != null && d.exp < Date.now() / 1000) {
        setLinkExpired(true);
      }
    } catch {
      setLinkExpired(true);
    }
  }, [token]);

  const REDIRECT_DELAY_MS = 5000;
  const LOGIN_PATH = "/login";
  useEffect(() => {
    if (!isConfirmSignup || onboardingEmailSent) return;
    const timer = setTimeout(() => {
      navigate(LOGIN_PATH, { replace: true });
    }, REDIRECT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isConfirmSignup, onboardingEmailSent, navigate]);

  const passwordVisible = () => {
    setIsVisible((prev) => !prev);
  };
  const confirmPasswordVisible = () => {
    setIsVisibleConfirm((prev) => !prev);
  };

  const [signUpFormData, setSignUpFormData] = useState<SignUpdata>({
    email: decodeEmail,
    firstName: "",
    lastName: "",
    userName: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSignUpFormData((prev) => ({ ...prev, [name]: value }));
  };

  const isDisabledBtn =
    Object.values(signUpFormData).some((val) => val.trim() === "") || isLoading;

  const hanldeSubmitSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setIsError("");
    try {
      const response = await fetch(`${BASE_URL}/signupData/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(signUpFormData),
      });
      const result = await response.json();
      if (response.ok) {
        setIsConfirmSignup(true);
        setOnboardingEmailSent(Boolean(result.onboardingEmailSent));
        sessionStorage.setItem("signup_completed", "true");
        if (signUpFormData.email && signUpFormData.newPassword) {
          sessionStorage.setItem(
            "signupEmail",
            signUpFormData.email.trim().toLowerCase(),
          );
          sessionStorage.setItem("signupPassword", signUpFormData.newPassword);
        }
        setSignUpFormData({
          email: decodeEmail,
          firstName: "",
          lastName: "",
          userName: "",
          newPassword: "",
          confirmPassword: "",
        });
      } else {
        const msg = result.message ?? "Sign up failed. Please try again.";
        setIsError(msg);
        if (
          response.status === 401 &&
          typeof msg === "string" &&
          msg.toLowerCase().includes("expired")
        ) {
          setLinkExpired(true);
        }
      }
    } catch (error) {
      console.log(error);
      setIsError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (linkExpired) {
    return (
      <AuthShell
        title="Sign up"
        subtitle="This invite link is no longer valid."
      >
        <div className="auth-shell-centered">
          <div
            className="authMessage authMessage--error signin-flash"
            style={{ justifyContent: "center" }}
          >
            <p
              className="text_signup"
              style={{ margin: "0 0 0.5rem 0", fontWeight: 600 }}
            >
              Signup link has expired
            </p>
            <p className="text_signup" style={{ margin: 0 }}>
              This link is valid for 7 days from when it was sent. Please ask
              your administrator to resend the invite.
            </p>
          </div>
          <div className="loginBtn loginBtn--signin">
            <Link
              to={LOGIN_PATH}
              className="login-btn signin-submit signup-success-cta-link"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <>
      {isConfirmSignup ? (
        <AuthShell title="You're all set">
          <div className="auth-shell-centered signup-confirmation-inner">
            <div className="signup_confirmation_card authMessage authMessage--success">
              <CheckCircle
                size={48}
                aria-hidden
                className="confirm_onboarding"
              />
              <p className="signup_confirmation_title">
                Your account has been{" "}
                <span className="sucess_text">successfully activated.</span>
              </p>
              {onboardingEmailSent ? (
                <>
                  <p className="text_signup onboarding_email_sent_text">
                    An email has been sent for onboarding. Please check your
                    inbox and use the link to complete onboarding.
                  </p>
                  <p className="text_signup" style={{ marginTop: "0.5rem" }}>
                   
                    {/* when you have completed onboarding. */}
                     <Link
                      to={LOGIN_PATH}
                      className="login-btn signin-submit signup-success-cta-link"
                    >
                      Sign in
                      <span aria-hidden>
                        <ArrowRight width={20} />
                      </span>
                    </Link>{" "}
                  </p>
                </>
              ) : (
                <>
                  <p className="small_text">
                    Redirecting to sign in in a few seconds…
                  </p>
                  <Link
                    to={LOGIN_PATH}
                    className="login-btn signin-submit signup-success-cta-link signup_confirmation_cta"
                  >
                    Sign in now
                    <span aria-hidden>
                      <ArrowRight width={20} />
                    </span>
                  </Link>
                  <p className="small_text">to continue to your account.</p>
                </>
              )}
            </div>
          </div>
        </AuthShell>
      ) : (
        <AuthShell
          variant="wide"
          title="Sign up"
          subtitle="Create an account to get started with the AI Eval platform."
        >
          <div className="signup-shell-body">
            <form
              className="signup_form"
              action=""
              autoComplete="off"
              onSubmit={hanldeSubmitSignUp}
            >
              <div className="settings_form_row">
                <div className="signup_form_group">
                  <label
                    htmlFor="signup-email"
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
                    id="signup-email"
                    className="signin-input signin-input--readonly"
                    type="email"
                    name="email"
                    value={signUpFormData.email}
                    readOnly
                    placeholder="you@company.com"
                  />
                </div>
                <div className="signup_form_group">
                  <label
                    htmlFor="signup-userName"
                    className="signin-field-label signin-field-label--inline"
                  >
                    <User
                      className="signin-field-label__icon"
                      size={24}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span>User name</span>
                  </label>
                  <input
                    id="signup-userName"
                    className="signin-input"
                    type="text"
                    name="userName"
                    value={signUpFormData.userName}
                    onChange={handleChange}
                    autoComplete="username"
                    placeholder="Choose a unique username"
                  />
                </div>
              </div>
              <div className="settings_form_row">
                <div className="signup_form_group">
                  <label
                    htmlFor="signup-firstName"
                    className="signin-field-label signin-field-label--inline"
                  >
                    <UserCircle
                      className="signin-field-label__icon"
                      size={24}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span>First name</span>
                  </label>
                  <input
                    id="signup-firstName"
                    className="signin-input"
                    type="text"
                    name="firstName"
                    value={signUpFormData.firstName}
                    onChange={handleChange}
                    autoComplete="given-name"
                    placeholder="First name"
                  />
                </div>
                <div className="signup_form_group">
                  <label
                    htmlFor="signup-lastName"
                    className="signin-field-label signin-field-label--inline"
                  >
                    <UserCircle
                      className="signin-field-label__icon"
                      size={24}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span>Last name</span>
                  </label>
                  <input
                    id="signup-lastName"
                    className="signin-input"
                    type="text"
                    name="lastName"
                    value={signUpFormData.lastName}
                    onChange={handleChange}
                    autoComplete="family-name"
                    placeholder="Last name"
                  />
                </div>
              </div>
              <div className="settings_form_row">
                <div className="signup_form_group">
                  <label
                    htmlFor="signup-newPassword"
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
                      id="signup-newPassword"
                      className="signin-input"
                      type={isVisible ? "text" : "password"}
                      maxLength={16}
                      name="newPassword"
                      value={signUpFormData.newPassword}
                      onChange={handleChange}
                      autoComplete="new-password"
                      placeholder="8–16 characters"
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
                <div className="signup_form_group">
                  <label
                    htmlFor="signup-confirmPassword"
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
                      id="signup-confirmPassword"
                      className="signin-input"
                      type={isVisibleConfirm ? "text" : "password"}
                      name="confirmPassword"
                      value={signUpFormData.confirmPassword}
                      maxLength={16}
                      onChange={handleChange}
                      autoComplete="new-password"
                      placeholder="Re-enter new password"
                    />
                    <button
                      type="button"
                      className="signin-eye"
                      onClick={confirmPasswordVisible}
                      aria-label={
                        isVisibleConfirm ? "Hide password" : "Show password"
                      }
                    >
                      {isVisibleConfirm ? (
                        <Eye size={18} strokeWidth={1.75} />
                      ) : (
                        <EyeOff size={18} strokeWidth={1.75} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {isError && <p className="settings_error">{isError}</p>}
              <div className="settings_form_actions signup-form-actions">
                <button
                  type="submit"
                  className={`login-btn signin-submit ${isDisabledBtn ? "disabled_css" : ""} ${isLoading ? "auth_btn_loading" : ""}`}
                  disabled={isDisabledBtn}
                  aria-busy={isLoading}
                >
                  {isLoading ? (
                    <>
                      Signing up…
                      <Loader2
                        className="auth_spinner"
                        size={20}
                        aria-hidden
                      />
                    </>
                  ) : (
                    <>
                      Sign up
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
                        Already have an account?{" "}
                        <Link to="/login">
                          <span>Sign in</span>
                        </Link>
                      </p>
            </form>
          </div>
        </AuthShell>
      )}
    </>
  );
};

export default SignUp;

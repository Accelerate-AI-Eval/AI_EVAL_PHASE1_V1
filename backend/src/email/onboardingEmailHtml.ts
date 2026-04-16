/** AI-Q onboarding email (signup admin + resend onboarding). */

import {
  EMAIL_BRAND_PRIMARY,
  EMAIL_PAGE_BG,
  emailSignatureCheckmarkHtml,
} from "./emailBrand.js";

export const ONBOARDING_MAIL_PLATFORM_NAME = "AI-Q Platform";

export function buildOnboardingEmailHtml(
  name: string,
  role: string,
  onboardingLink: string,
  organization: string,
): string {
  const brandHeading = ONBOARDING_MAIL_PLATFORM_NAME.replace("-", "&#8209;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to ${ONBOARDING_MAIL_PLATFORM_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_PAGE_BG};font-family:Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#333333;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${EMAIL_PAGE_BG};padding:24px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;border:1px solid #eaeaea;">
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 24px;font-size:22px;line-height:1.3;font-weight:700;color:${EMAIL_BRAND_PRIMARY};">Welcome to ${brandHeading}, ${name}!</h1>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#333333;">We're excited to have you join <strong>${organization}</strong> as a <strong>${role}</strong>.</p>
            <p style="margin:0 0 28px;font-size:16px;line-height:1.5;color:#333333;">Your account has been successfully activated, and you can now access the features available to you in ${ONBOARDING_MAIL_PLATFORM_NAME}.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
              <tr>
                <td style="border-radius:6px;background-color:${EMAIL_BRAND_PRIMARY};">
                  <a href="${onboardingLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">Go to Onboarding</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#333333;">If you have any questions, feel free to reply to this email - we're here to help.</p>
            <p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:#333333;font-weight:600;">Here are a few things you can do next:</p>
            <ul style="margin:0 0 24px;padding:0 0 0 20px;font-size:16px;line-height:1.6;color:#333333;">
              <li style="margin:0 0 8px;">Set up your profile and preferences</li>
              <li style="margin:0 0 8px;">Explore ${ONBOARDING_MAIL_PLATFORM_NAME} features for your role</li>
              <li style="margin:0;">Invite teammates to collaborate</li>
            </ul>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#333333;">Cheers,<br>The ${ONBOARDING_MAIL_PLATFORM_NAME} Team</p>
            ${emailSignatureCheckmarkHtml()}
            <p style="margin:0;font-size:12px;line-height:1.5;color:#888888;text-align:center;">&copy; 2026 ${ONBOARDING_MAIL_PLATFORM_NAME}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

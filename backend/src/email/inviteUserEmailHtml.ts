import {
  EMAIL_BRAND_PRIMARY,
  EMAIL_PAGE_BG,
  emailSignatureCheckmarkHtml,
} from "./emailBrand.js";

export const INVITE_MAIL_PLATFORM_NAME = "AI-Q Platform";

/** Invite / reinvite email body: table layout + inline styles for common clients. */
export function buildInviteUserEmailHtml(
  organizationName: string,
  role: string,
  confirmationLink: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to ${INVITE_MAIL_PLATFORM_NAME}</title>
</head>
<body style="margin:0;padding:0;background-color:${EMAIL_PAGE_BG};font-family:Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#333333;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${EMAIL_PAGE_BG};padding:24px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;">
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 24px;font-size:22px;line-height:1.3;font-weight:700;color:${EMAIL_BRAND_PRIMARY};">Welcome to ${INVITE_MAIL_PLATFORM_NAME.replace(
              "-",
              "&#8209;",
            )}</h1>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#333333;">Hello,</p>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#333333;">You've been invited to join <strong>${INVITE_MAIL_PLATFORM_NAME}</strong> as a <strong>${role}</strong> in <strong>${organizationName}</strong>.</p>
            <p style="margin:0 0 28px;font-size:16px;line-height:1.5;color:#333333;">Please confirm your email address to activate your account and set your password.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
              <tr>
                <td style="border-radius:6px;background-color:${EMAIL_BRAND_PRIMARY};">
                  <a href="${confirmationLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">Confirm Email</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#333333;">If you did not request this invitation, you can safely ignore this email.</p>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#333333;">Thanks,<br>The ${INVITE_MAIL_PLATFORM_NAME} Team</p>
            ${emailSignatureCheckmarkHtml()}
            <p style="margin:0;font-size:12px;line-height:1.5;color:#888888;text-align:center;">&copy; 2026 ${INVITE_MAIL_PLATFORM_NAME}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

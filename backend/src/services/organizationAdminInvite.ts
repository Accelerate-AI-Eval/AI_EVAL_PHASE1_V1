import { db } from "../database/db.js";
import { usersTable } from "../schema/user_management/invite_user_schema.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import emailConfig from "../functions/emailconfig.js";
import { SIGNUP_LINK_EXPIRY_JWT } from "../constants/tokenExpiry.js";
import {
  buildInviteUserEmailHtml,
  INVITE_MAIL_PLATFORM_NAME,
} from "../email/inviteUserEmailHtml.js";

function capitalizeFirstLetter(str: string): string {
  if (!str || typeof str !== "string") return str;
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export type CustomerOrgPlatformRole = "vendor" | "buyer";

/**
 * Sends signup invite email and inserts invited admin for a customer organization.
 * Call only after the organization row exists. Caller should roll back the org on failure.
 */
export async function inviteCustomerOrganizationAdmin(params: {
    email: string;
    organizationId: number;
    organizationName: string;
    invitedByUserId: string;
    customerPlatformRole: CustomerOrgPlatformRole;
}): Promise<void> {
  const email = params.email.trim().toLowerCase();
  if (!email) {
    throw Object.assign(new Error("Admin email is required"), { code: "BAD_REQUEST" });
  }

  const existingUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existingUser.length > 0) {
    throw Object.assign(new Error("User with this email already exists"), { code: "CONFLICT" });
  }

  const secret = process.env.JWT_SECRET_KEY;
  const BASE_URL = process.env.BASE_URL;
  if (!secret) {
    throw Object.assign(new Error("JWT_SECRET_KEY not set"), { code: "SERVER_ERROR" });
  }
  if (!BASE_URL) {
    throw Object.assign(new Error("BASE_URL is not set"), { code: "SERVER_ERROR" });
  }

  const token = jwt.sign({ email }, secret, { expiresIn: SIGNUP_LINK_EXPIRY_JWT } as jwt.SignOptions);
  const confirmationLink = `${BASE_URL}/signup/${token}`;

  const organizationNameCapitalized = capitalizeFirstLetter(params.organizationName);
  const roleCapitalized = capitalizeFirstLetter("admin");

  const senderAddress = process.env.SENDER_EMAIL_ID;
  if (!senderAddress) {
    throw Object.assign(new Error("Sender email is not configured"), { code: "SERVER_ERROR" });
  }

  const transporter = emailConfig();
  try {
    await transporter.sendMail({
      from: {
        name: INVITE_MAIL_PLATFORM_NAME,
        address: senderAddress,
      },
      to: email,
      subject: `You're invited to join ${INVITE_MAIL_PLATFORM_NAME}`,
      html: buildInviteUserEmailHtml(organizationNameCapitalized, roleCapitalized, confirmationLink),
    });
  } catch (emailErr: unknown) {
    console.error("inviteCustomerOrganizationAdmin: failed to send invitation email", emailErr);
    throw Object.assign(
      new Error("Failed to send invitation email. No user was created. Please try again or contact support."),
      { code: "EMAIL_FAILED" },
    );
  }

  await db.insert(usersTable).values({
    email,
    organization_id: params.organizationId,
    role: "admin",
    invited_at: new Date(),
    account_status: "invited",
    invited_by: String(params.invitedByUserId),
    user_platform_role: params.customerPlatformRole,
  });
}

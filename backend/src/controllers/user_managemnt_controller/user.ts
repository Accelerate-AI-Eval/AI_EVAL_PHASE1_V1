// backend/src/controllers/user_management/inviteUserController.ts
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/user_management/invite_user_schema.js";
import { createOrganization } from "../../schema/schema.js";
import type { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import emailConfig from "../../functions/emailconfig.js";
import { ONBOARDING_LINK_EXPIRY_JWT, SIGNUP_LINK_EXPIRY_JWT } from "../../constants/tokenExpiry.js";
import {
  buildOnboardingEmailHtml,
  ONBOARDING_MAIL_PLATFORM_NAME,
} from "../../email/onboardingEmailHtml.js";
import { onboardingPathSegmentFromOrgType } from "../../utils/onboardingPathFromOrgType.js";
import {
  buildInviteUserEmailHtml,
  INVITE_MAIL_PLATFORM_NAME,
} from "../../email/inviteUserEmailHtml.js";

/** Capitalize first letter of each word (e.g. "system admin" -> "System Admin"). */
function capitalizeFirstLetter(str: string): string {
  if (!str || typeof str !== "string") return str;
  return str
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export const inviteUser = async (req: Request, res: Response) => {
  const BASE_URL = process.env.BASE_URL;

  try {
    let { email, organization, role, user } = req.body;

    if (!email || !organization || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    email = email.toLowerCase();

    const existingUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existingUser.length > 0) {
      return res
        .status(409)
        .json({ message: "User with this email already exists" });
    }

    // Resolve organization to numeric id (AI EVAL = 1, else use provided id)
    const orgIdNum = organization === "AI EVAL" || organization === "1" ? 1 : Number(organization);
    if (!Number.isInteger(orgIdNum) || orgIdNum < 1) {
      return res.status(400).json({ message: "Invalid organization" });
    }

    // Each organization may have only one admin; reject inviting a second admin for the same org
    if (String(role).toLowerCase().trim() === "admin") {
      const existingAdmin = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.organization_id, orgIdNum),
            eq(usersTable.role, "admin"),
          ),
        )
        .limit(1);
      if (existingAdmin.length > 0) {
        return res.status(400).json({
          message:
            "This organization already has an admin. Only one admin per organization is allowed.",
        });
      }
    }

    // When system admin invites to AI EVAL, store the selected system role (system admin, system user, system manager, system viewer, ai directory curator)
    const systemRoles = [
      "system admin",
      "system user",
      "system manager",
      "system viewer",
      "ai directory curator",
    ];
    const isAiEval = orgIdNum === 1;
    let platform_role: string;
    if (
      isAiEval &&
      role &&
      systemRoles.includes(String(role).toLowerCase().trim())
    ) {
      platform_role = String(role).toLowerCase().trim();
    } else if (isAiEval) {
      platform_role = "system admin";
    } else {
      platform_role = "";
    }

    const secret = process.env.JWT_SECRET_KEY;
    if (!secret) throw new Error("JWT_SECRET_KEY not set");
    if (!BASE_URL) {
      return res.status(500).json({ message: "Server configuration error: BASE_URL is not set" });
    }

    const token = jwt.sign({ email }, secret, { expiresIn: SIGNUP_LINK_EXPIRY_JWT } as jwt.SignOptions);
    const confirmationLink = `${BASE_URL}/signup/${token}`;

    const orgRows = await db
      .select({ organizationName: createOrganization.organizationName })
      .from(createOrganization)
      .where(eq(createOrganization.id, orgIdNum))
      .limit(1);
    const organizationNameForEmail = orgRows[0]?.organizationName ?? "Organization";
    const organizationNameCapitalized = capitalizeFirstLetter(organizationNameForEmail);
    const roleCapitalized = capitalizeFirstLetter(role);

    const senderAddress = process.env.SENDER_EMAIL_ID;
    if (!senderAddress) {
      return res.status(500).json({ message: "Server configuration error: sender email is not configured" });
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
        html: buildInviteUserEmailHtml(
          organizationNameCapitalized,
          roleCapitalized,
          confirmationLink,
        ),
      });
    } catch (emailErr: unknown) {
      console.error("Invite user: failed to send invitation email", emailErr);
      return res.status(502).json({
        message: "Failed to send invitation email. No user was created. Please try again or contact support.",
      });
    }

    console.log("Invitation email sent to:", email);

    await db.insert(usersTable).values({
      email,
      organization_id: orgIdNum,
      role,
      invited_at: new Date(),
      account_status: "invited",
      invited_by: user,
      user_platform_role: platform_role,
    });

    console.log("User inserted successfully into DB:", email);

    return res.status(201).json({ message: "User invited successfully" });
  } catch (err: any) {
    console.error("Error in /invite_user:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

/**
 * Resend signup (invite) link to an existing invited user.
 * POST /reinvite_user/:id
 */
export const reinviteUser = async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const BASE_URL = process.env.BASE_URL;
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret || !BASE_URL) {
    return res.status(500).json({ message: "Server configuration error" });
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const accountStatus = String(user.account_status ?? "").toLowerCase();
    if (accountStatus !== "invited" && accountStatus !== "expired") {
      return res.status(400).json({ message: "User is already confirmed. Reinvite is only for invited or expired users." });
    }
    const email = (user.email ?? "").toLowerCase();
    const token = jwt.sign({ email }, secret, { expiresIn: SIGNUP_LINK_EXPIRY_JWT } as jwt.SignOptions);
    const confirmationLink = `${BASE_URL}/signup/${token}`;

    await db
      .update(usersTable)
      .set({ invited_at: new Date(), account_status: "invited", onboarding_status: "pending" })
      .where(eq(usersTable.id, userId));

    const [orgRow] = await db
      .select({ organizationName: createOrganization.organizationName })
      .from(createOrganization)
      .where(eq(createOrganization.id, user.organization_id))
      .limit(1);
    const organizationNameCapitalized = capitalizeFirstLetter(orgRow?.organizationName ?? "Organization");
    const roleCapitalized = capitalizeFirstLetter(String(user.role ?? ""));

    const transporter = emailConfig();
    await transporter.sendMail({
      from: { name: INVITE_MAIL_PLATFORM_NAME, address: process.env.SENDER_EMAIL_ID! },
      to: email,
      subject: `You're invited to join ${INVITE_MAIL_PLATFORM_NAME}`,
      html: buildInviteUserEmailHtml(organizationNameCapitalized, roleCapitalized, confirmationLink),
    });
    return res.status(200).json({ message: "Signup link resent successfully" });
  } catch (err: any) {
    console.error("Reinvite error:", err);
    return res.status(500).json({ message: "Failed to resend invite", error: err.message });
  }
};

/**
 * Resend onboarding link to a user who has signed up but not completed onboarding.
 * POST /resend_onboarding/:id
 */
export const resendOnboardingLink = async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: "Invalid user id" });
  }
  const BASE_URL = process.env.BASE_URL;
  const secret = process.env.JWT_SECRET_KEY;
  if (!secret || !BASE_URL) {
    return res.status(500).json({ message: "Server configuration error" });
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (String(user.user_signup_completed ?? "").toLowerCase() !== "true") {
      return res.status(400).json({ message: "User has not completed signup. Resend onboarding is only for users who have signed up." });
    }
    if (String(user.user_onboarding_completed ?? "").toLowerCase() === "true") {
      return res.status(400).json({ message: "User has already completed onboarding." });
    }
    const email = (user.email ?? "").toLowerCase();

    const [orgRow] = await db
      .select({
        organizationName: createOrganization.organizationName,
        organizationType: createOrganization.organizationType,
      })
      .from(createOrganization)
      .where(eq(createOrganization.id, user.organization_id))
      .limit(1);

    const organizationTypeForJwt =
      String(orgRow?.organizationType ?? "").trim().toLowerCase() === "buyer"
        ? "buyer"
        : "vendor";

    const token = jwt.sign(
      {
        email,
        userId: user.id,
        organizationId: user.organization_id,
        organizationType: organizationTypeForJwt,
      },
      secret,
      { expiresIn: ONBOARDING_LINK_EXPIRY_JWT } as jwt.SignOptions,
    );
    const pathSegment = onboardingPathSegmentFromOrgType(orgRow?.organizationType);
    const onboardingLink = `${BASE_URL}/onBoarding/${pathSegment}/${token}`;
    const orgDisplayName = capitalizeFirstLetter(orgRow?.organizationName ?? "");
    const name = (user.user_name ?? user.email ?? "User").toString();
    const roleCapitalized = capitalizeFirstLetter(String(user.role ?? ""));

    const transporter = emailConfig();
    await transporter.sendMail({
      from: { name: ONBOARDING_MAIL_PLATFORM_NAME, address: process.env.SENDER_EMAIL_ID! },
      to: email,
      subject: `Welcome to ${ONBOARDING_MAIL_PLATFORM_NAME}`,
      html: buildOnboardingEmailHtml(name, roleCapitalized, onboardingLink, orgDisplayName),
    });
    await db
      .update(usersTable)
      .set({ onboarding_status: "pending", onboarding_link_sent_at: new Date() })
      .where(eq(usersTable.id, userId));
    return res.status(200).json({ message: "Onboarding link resent successfully" });
  } catch (err: any) {
    console.error("Resend onboarding error:", err);
    return res.status(500).json({ message: "Failed to resend onboarding link", error: err.message });
  }
};

export const fetchUsers = async (req: Request, res: Response) => {
  try {
    const allUsers = db.select().from(usersTable);
    res.status(200).json(allUsers);
  } catch (err: any) {
    console.error("error", err.msg);
    res.status(200).json({ message: "Server error", error: err.message });
  }
};

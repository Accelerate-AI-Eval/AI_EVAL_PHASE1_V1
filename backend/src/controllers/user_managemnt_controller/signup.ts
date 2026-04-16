import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "../../database/db.js";
import type { Request, Response } from "express";
import { createOrganization, usersTable } from "../../schema/schema.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import emailConfig from "../../functions/emailconfig.js";
import { ONBOARDING_LINK_EXPIRY_JWT } from "../../constants/tokenExpiry.js";
import {
  buildOnboardingEmailHtml,
  ONBOARDING_MAIL_PLATFORM_NAME,
} from "../../email/onboardingEmailHtml.js";
import { onboardingPathSegmentFromOrgType } from "../../utils/onboardingPathFromOrgType.js";

const userSignup = async (req: Request, res: Response) => {
  const userData = req.body ?? {};
  const BASE_URL = process.env.BASE_URL;
  const emailFromBody = userData.email != null ? String(userData.email).trim() : "";
  const emailFromToken = (req as { email?: string }).email != null ? String((req as { email?: string }).email).trim() : "";
  const email = (emailFromBody || emailFromToken).toLowerCase();
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  function capitalizeFirstLetter(str: string): string {
    if (!str || typeof str !== "string") return str;
    return str.trim().split(/\s+/).map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
  }

  try {
    const newPassword = userData.newPassword != null ? String(userData.newPassword) : "";
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "Password is required and must be at least 6 characters" });
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user || user.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingRow = user[0];
    if (!existingRow) {
      return res.status(404).json({ message: "User not found" });
    }
    if (existingRow.user_signup_completed === "true") {
      return res.status(409).json({ message: "Signup already completed" });
    }

    const orgId = existingRow.organization_id;
    const isAiEvalOrg = orgId === 1;

    // Get org's platform role: use invited user's role if set (system admin/user/manager/viewer/ai directory curator), else fall back to org role
    const systemRoles = ["system admin", "system user", "system manager", "system viewer", "ai directory curator"];
    const invitedPlatformRole = existingRow.user_platform_role != null
      ? String(existingRow.user_platform_role).trim().toLowerCase()
      : "";

    const orgUsersWithRole = await db
      .select({ user_platform_role: usersTable.user_platform_role })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.organization_id, orgId),
          isNotNull(usersTable.user_platform_role),
          ne(usersTable.user_platform_role, ""),
        ),
      )
      .limit(1);

    let platformRoleToStore: string | null = null;
    if (isAiEvalOrg) {
      // Preserve role from invitation (system admin, system user, system manager, system viewer)
      if (invitedPlatformRole && systemRoles.includes(invitedPlatformRole)) {
        platformRoleToStore = invitedPlatformRole;
      } else {
        platformRoleToStore = "system admin";
      }
    } else if (orgUsersWithRole.length > 0 && orgUsersWithRole[0]?.user_platform_role) {
      const raw = String(orgUsersWithRole[0].user_platform_role).trim().toLowerCase();
      if (raw === "vendor" || raw === "buyer" || systemRoles.includes(raw)) {
        platformRoleToStore = raw;
      }
    }

    const userNameTrimmed = userData.userName != null ? String(userData.userName).trim() : "";
    if (userNameTrimmed !== "") {
      const existingByUsername = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.user_name, userNameTrimmed),
            ne(usersTable.id, existingRow.id),
          ),
        )
        .limit(1);
      if (existingByUsername.length > 0) {
        return res.status(409).json({ message: "Username already exists" });
      }
    }

    // Initial signup update: do not set user_onboarding_completed here (stays schema default "false").
    // It is set later only for: (1) non-admins (skip onboarding), or (2) admins when org already onboarded.
    const signupUpdatePayload = {
      email,
      user_first_name: userData.firstName != null ? String(userData.firstName) : null,
      user_last_name: userData.lastName != null ? String(userData.lastName) : null,
      user_name: userData.userName != null ? String(userData.userName).trim() || null : null,
      user_password: hashedPassword,
      account_status: "confirmed" as const,
      user_signup_completed: "true" as const,
      ...(platformRoleToStore != null ? { user_platform_role: platformRoleToStore } : {}),
    };

    await db
      .update(usersTable)
      .set(signupUpdatePayload)
      .where(eq(usersTable.email, email));

    const updatedDbUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    const dbUser = updatedDbUser[0];
    if (!dbUser) {
      return res.status(500).json({ message: "User not found after update" });
    }
    const userId = dbUser.id;
    const organizationId = dbUser.organization_id;

    // Only admin users can complete onboarding: org role "admin" (for regular orgs) or "system admin" (for AI Eval). Non-admins never receive onboarding emails and are marked onboarded so they skip it.
    const userOrgRole = String(dbUser.role ?? "").trim().toLowerCase();
    const isAdminUser =
      userOrgRole === "admin" || (isAiEvalOrg && userOrgRole === "system admin");

    // Check if this organization has already completed onboarding (any admin in the org has completed it).
    const orgOnboardedUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.organization_id, dbUser.organization_id),
          eq(usersTable.user_onboarding_completed, "true"),
        ),
      )
      .limit(1);
    const isOrgOnboardingCompleted = orgOnboardedUsers.length > 0;

    // Resolve organization (name + buyer/vendor) for email link and JWT
    let orgDisplayName = "";
    let organizationTypeForOnboarding: "buyer" | "vendor" = "vendor";
    const orgRows = await db
      .select({
        organizationName: createOrganization.organizationName,
        organizationType: createOrganization.organizationType,
      })
      .from(createOrganization)
      .where(eq(createOrganization.id, dbUser.organization_id))
      .limit(1);
    if (orgRows.length > 0 && orgRows[0]?.organizationName) {
      orgDisplayName = orgRows[0].organizationName;
    }
    const orgTypeRaw = orgRows[0]?.organizationType;
    if (String(orgTypeRaw ?? "").trim().toLowerCase() === "buyer") {
      organizationTypeForOnboarding = "buyer";
    }

    const secret = process.env.JWT_SECRET_KEY;
    if (!secret) throw new Error("JWT_SECRET_KEY not set");
    const token = jwt.sign(
      {
        email,
        userId,
        organizationId,
        organizationType: organizationTypeForOnboarding,
      },
      secret,
      {
        expiresIn: ONBOARDING_LINK_EXPIRY_JWT,
      } as jwt.SignOptions,
    );

    const pathSegment = onboardingPathSegmentFromOrgType(organizationTypeForOnboarding);
    const onboardingLink = `${BASE_URL}/onBoarding/${pathSegment}/${token}`;

    let onboardingEmailSent = false;

    if (isAdminUser) {
      // --- Admin user: may need onboarding or may skip if org already onboarded ---

      if (!isOrgOnboardingCompleted) {
        // Org has not completed onboarding: admin must complete it. Leave user_onboarding_completed false and send onboarding link email.
        const transporter = emailConfig();

        await transporter.sendMail({
          from: {
            name: ONBOARDING_MAIL_PLATFORM_NAME,
            address: process.env.SENDER_EMAIL_ID!,
          },
          to: email,
          subject: `Welcome to ${ONBOARDING_MAIL_PLATFORM_NAME}`,
          html: buildOnboardingEmailHtml(
            dbUser.user_name ?? "User",
            capitalizeFirstLetter(String(dbUser.role ?? "")),
            onboardingLink,
            capitalizeFirstLetter(String(orgDisplayName ?? "")),
          ),
        });

        console.log("Onboarding email sent to admin:", email);
        onboardingEmailSent = true;

        await db
          .update(usersTable)
          .set({
            onboarding_link_sent_at: new Date(),
            ...(platformRoleToStore != null ? { user_platform_role: platformRoleToStore } : {}),
          })
          .where(eq(usersTable.id, dbUser.id));
      } else {
        // Organization onboarding already completed (e.g. another admin invited this admin): do not send onboarding email; mark as onboarded so they proceed normally.
        await db
          .update(usersTable)
          .set({
            user_onboarding_completed: "true",
            onboarding_status: "completed",
            ...(platformRoleToStore != null ? { user_platform_role: platformRoleToStore } : {}),
          })
          .where(eq(usersTable.id, dbUser.id));
        console.log(
          "Org already onboarded; admin signup without onboarding email:",
          email,
        );
      }
    } else {
      // --- Non-admin user (analyst, manager, viewer, user): do not send onboarding email; they only get signup confirmation and redirect to login ---
      await db
        .update(usersTable)
        .set({
          user_onboarding_completed: "true",
          onboarding_status: "completed",
          ...(platformRoleToStore != null ? { user_platform_role: platformRoleToStore } : {}),
        })
        .where(eq(usersTable.id, dbUser.id));
      console.log(
        "Non-admin signup; no onboarding email (onboarding skipped):",
        email,
      );
    }

    res.status(201).json({
      message: "User signup successful",
      token,
      userId,
      onboardingEmailSent,
    });
  } catch (error) {
    console.error("Signup error:", error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: "Internal server error", details: message });
  }
};

export default userSignup;

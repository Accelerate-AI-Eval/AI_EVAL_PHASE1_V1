import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { createOrganization, usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt, { type SignOptions } from "jsonwebtoken";
import { getJwtSecret, getJwtExpiry } from "../../config/auth.js";

const userLogin = async (req: Request, res: Response) => {
  const rawEmailOrUsername = req.body?.email;
  const userPassword = req.body?.password;
  const input = (rawEmailOrUsername ?? "").toString().trim();
  if (!input) {
    return res.status(401).json({ message: "Email or username is required" });
  }
  if (userPassword == null || userPassword === "") {
    return res.status(401).json({ message: "Password is required" });
  }

  const isEmail = input.includes("@");
  const emailForLookup = isEmail ? input.toLowerCase() : null;
  const usernameForLookup = isEmail ? null : input;

  try {
    const rows = await db
      .select({
        user: usersTable,
        organizationName: createOrganization.organizationName,
        organizationStatus: createOrganization.organizationStatus,
      })
      .from(usersTable)
      .leftJoin(createOrganization, eq(usersTable.organization_id, createOrganization.id))
      .where(
        isEmail
          ? eq(usersTable.email, emailForLookup!)
          : eq(usersTable.user_name, usernameForLookup!),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      return res.status(401).json({ message: "User not found" });
    }
    const user_table = row.user;

    const accountStatus = String(user_table.account_status ?? "").trim().toLowerCase();
    const signupCompleted = String(user_table.user_signup_completed ?? "").trim().toLowerCase();
    const notActivatedResponse = {
      code: "invited",
      message:
        "This account hasn't been activated yet — please check your email for the invitation",
    };
    const storedPasswordHash = user_table.user_password;
    if (storedPasswordHash == null || storedPasswordHash.trim() === "") {
      return res.status(401).json(notActivatedResponse);
    }
    if (
      accountStatus === "invited" ||
      accountStatus === "expired" ||
      signupCompleted !== "true"
    ) {
      return res.status(401).json(notActivatedResponse);
    }

    const user = await db
      .select()
      .from(usersTable)
      .where(
        isEmail
          ? eq(usersTable.email, emailForLookup!)
          : eq(usersTable.user_name, usernameForLookup!),
      )
      .limit(1);
    const usertable = user[0];
    if (!usertable) {
      return res.status(401).json({ message: "User not found" });
    }

    const userStatus = String(usertable.userStatus ?? "").trim().toLowerCase();
    if (userStatus !== "active") {
      return res.status(401).json({
        code: "inactive",
        message: "This account is inactive. Contact your administrator.",
      });
    }

    const passwordMatch = await bcrypt.compare(userPassword, storedPasswordHash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Password is mismatched" });
    }

    const organizationStatus = String(row.organizationStatus ?? "")
      .trim()
      .toLowerCase();
    if (organizationStatus !== "active") {
      return res.status(403).json({
        code: "organization_inactive",
        message:
          "Your organization is inactive. You cannot sign in. Please contact your administrator.",
      });
    }

    // const checkUser = await db
    //   .select()
    //   .from(usersTable)
    //   .where(
    //     and(
    //       eq(usersTable.email, useremail),
    //       eq(usersTable.user_password, userPassword),
    //     ),
    //   )
    //   .limit(1);

    // console.log("checkUser", user);

    const secret = getJwtSecret();
    const token = jwt.sign(
      {
        id: user_table.id,
        email: user_table.email,
        userRole: user_table.role,
      },
      secret,
      { expiresIn: getJwtExpiry() } as SignOptions,
    );

    const userDetails = [{ ...user_table, organization_name: row.organizationName ?? "", organization_id: user_table.organization_id }];
    return res.status(200).json({
      message: "User Login Successful",
      token,
      userDetails,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "An error occurred during login. Please try again.",
    });
  }
};

export default userLogin;

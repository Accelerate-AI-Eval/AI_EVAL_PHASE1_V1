import { pgTable, uuid, varchar, timestamp, integer, jsonb, boolean, } from "drizzle-orm/pg-core";
// Table: vendor_onboarding (SQL). camelCase keys for .values(), first arg = DB column.
// One onboarding per org: unique on organization_id.
export const vendorOnboarding = pgTable("vendor_onboarding", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: integer("user_id").notNull(),
    organizationId: varchar("organization_id", { length: 255 }).notNull().unique(),
    vendorName: varchar("vendor_name", { length: 255 }),
    vendorType: varchar("vendor_type", { length: 100 }).notNull(),
    sector: varchar("sector", { length: 500 }),
    vendorMaturity: varchar("vendor_maturity", { length: 100 }),
    companyWebsite: varchar("company_website", { length: 500 }).notNull(),
    companyDescription: varchar("company_description", { length: 500 }).notNull(),
    primaryContactName: varchar("primary_contact_name", { length: 100 }).notNull(),
    primaryContactEmail: varchar("primary_contact_email", { length: 255 }).notNull(),
    primaryContactRole: varchar("primary_contact_role", { length: 100 }),
    employeeCount: varchar("employee_count", { length: 50 }).notNull(),
    yearFounded: integer("year_founded").notNull(),
    headquartersLocation: varchar("headquarters_location", { length: 100 }).notNull(),
    operatingRegions: jsonb("operating_regions"),
    publicDirectoryListing: boolean("public_directory_listing").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const vendors = vendorOnboarding;

// src/config/navConfig.ts
import {
  Building2,
  ClipboardCheck,
  FileArchive,
  FileCheck,
  FileText,
  Globe,
  LayoutDashboard,
  Scale,
  Shield,
  TrendingUp,
  UserCog,
  Users,
  Landmark,
  type LucideIcon,
  BotIcon,
  Layers,
  TestTube,
  Workflow,
} from "lucide-react"

export interface NavItemConfig {
  label: string
  icon: LucideIcon
  path: string
  accessRoles: string[]
  systemRoles: string[]
}

export const NAVIGATION = {
  admin: [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
      accessRoles: ["admin", "user", "manager", "lead", "engineer", "viewer"],
      systemRoles: ["system admin", "system manager", "system viewer", "ai directory curator", "buyer", "vendor"],
    },
    {
      label: "Organizations",
      icon: Landmark,
      path: "/organizations",
      accessRoles: ["admin"],
      systemRoles: ["system admin", "system manager", "system viewer"],
    },
    {
      label: "Attestation",
      icon: FileCheck,
      path: "/attestation_details",
      accessRoles: ["admin", "user", "manager", "lead"],
      systemRoles: ["system admin", "system manager", "system viewer", "ai directory curator", "vendor"],
    },
    {
      label: "Sales Agent",
      icon:  BotIcon,
      path: "/salesEnablement",
      accessRoles: ["admin", "manager", "lead", "engineer"],
      systemRoles: ["system admin", "vendor"],
    },
    // ** Not needed for the Phase-1
    // {
    //   label: "Solutions Architect",
    //   icon: Layers,
    //   path: "/evidence-library",
    //   accessRoles: ["admin"],
    //   systemRoles: ["system admin", "vendor"],
    // },
    {
      label: "AI Vendor Directory",
      icon: Building2,
      path: "/vendor-directory",
      accessRoles: ["admin", "manager", "lead", "engineer", "viewer"],
      systemRoles: ["system admin", "system manager", "system viewer", "ai directory curator", "buyer"],
    },
    {
      label: "Assessments",
      icon: ClipboardCheck,
      path: "/assessments",
      accessRoles: ["admin", "user", "manager", "lead", "engineer", "viewer"],
      systemRoles: ["system admin", "system manager", "system viewer", "buyer", "vendor"],
    },
    // {
    //   label: "Security Center",
    //   icon: Shield,
    //   path: "/security_center",
    //   accessRoles: ["admin"],
    //   systemRoles: ["system admin", "buyer"],
    // },
    // {
    //   label: "Testing",
    //   icon: TestTube,
    //   path: "/governance",
    //   accessRoles: ["admin"],
    //   systemRoles: ["system admin", "buyer"],
    // },
    {
      label: "Reports",
      icon: FileText,
      path: "/reports",
      accessRoles: ["admin", "manager", "lead", "engineer", "viewer"],
      systemRoles: ["system admin", "system manager", "system viewer", "buyer", "vendor"],
    },
    {
      label: "Risk Mapping",
      icon: Workflow,
      // icon: Flo,
      path: "/riskMappings",
      accessRoles: ["admin", "manager", "lead", "engineer"],
      systemRoles: ["system admin", "system manager", "system viewer", "buyer", "vendor"],
    },
    {
      label: "Product Profile",
      icon: Globe,
      path: "/product_profile",
      accessRoles: ["admin", "user", "manager", "lead", "engineer", "viewer"],
      systemRoles: ["system admin", "system manager", "system viewer", "vendor"],
    },
    {
      label: "User Management",
      icon: UserCog,
      path: "/userManagement",
      accessRoles: ["admin", "manager"],
      systemRoles: ["system admin", "system manager", "system viewer", "buyer", "vendor"],
    },
  ] as NavItemConfig[],
}

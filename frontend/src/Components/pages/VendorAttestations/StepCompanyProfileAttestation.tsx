import type { ChangeEvent } from "react";
import type { ReactNode } from "react";
import HeaderForVendor from "../VendorOnboarding/HeaderForVendor";
import FormField from "../../UI/FormField";
import Select from "../../UI/Select";
import Input from "../../UI/Input";
import IndustrySectorDependency from "../../UI/IndustrySectorDependency";
import ChipMultiSelect from "../../UI/ChipMultiSelect";
import YearPicker from "../../UI/YearPicker";
import {
  VENDOR_TYPES,
  VENDOR_MATURITY_LEVELS,
  EMPLOYEE_COUNTS,
  HEADQUARTERS_LOCATION,
  OPERATING_REGIONS,
  VENDOR_HELPTEXT,
  VENDOR_OPERATING_REGIONS_GLOBAL_VALUE,
} from "../../../constants/vendorOnboardingData";
import type { AttestationCompanyProfile } from "../../../types/vendorSelfAttestation";

export interface StepCompanyProfileAttestationProps {
  companyProfile: AttestationCompanyProfile;
  setCompanyProfile: React.Dispatch<React.SetStateAction<AttestationCompanyProfile>>;
  fieldErrors?: Record<string, string>;
  title?: string;
  subTitle?: string;
  icon?: ReactNode;
}

const StepCompanyProfileAttestation = ({
  companyProfile,
  setCompanyProfile,
  fieldErrors = {},
  title = "Company Profile",
  subTitle,
  icon,
}: StepCompanyProfileAttestationProps) => {
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCompanyProfile((prev) => ({ ...prev, [name]: value }));
  };

  const sectorValue = {
    public_sector: companyProfile.sector?.public_sector ?? [],
    private_sector: companyProfile.sector?.private_sector ?? [],
    non_profit_sector: companyProfile.sector?.non_profit_sector ?? [],
  };

  const currentYear = new Date().getFullYear();

  return (
    <>
      <HeaderForVendor
        title_vendor={title}
        sub_title_vendor={subTitle}
        icon={icon}
        className="header_for_vendor"
      />

      <div className="step_form_body">
        <div className="step_form_right">
          <div className="form_fields_vendor">
            <FormField
              label="What type of vendor are you?"
              mandatory={true}
              tooltipText={VENDOR_HELPTEXT.vendorType}
              errorText={fieldErrors.vendorType}
            >
              <Select
                labelName=""
                id="vendorType"
                name="vendorType"
                value={companyProfile.vendorType || ""}
                onChange={handleChange}
                default_option="Select vendor type"
                options={VENDOR_TYPES}
                required
              />
            </FormField>
          </div>
          <div className="form_fields_vendor">
            <FormField
              label="What is your Target Industries"
              mandatory={true}
              tooltipText={VENDOR_HELPTEXT.sector}
              errorText={fieldErrors.sector}
            >
              <IndustrySectorDependency
                id="industry_sec"
                sector={sectorValue}
                onChange={(sector) =>
                  setCompanyProfile((prev) => ({ ...prev, sector }))
                }
                defaultCategoryOption="Select sector category"
                required
              />
            </FormField>
          </div>
          <div className="form_fields_vendor">
            <FormField
              label="What stage is your company at?"
              mandatory={true}
              tooltipText={VENDOR_HELPTEXT.vendorMaturity}
              errorText={fieldErrors.vendorMaturity}
            >
              <Select
                labelName=""
                id="vendorMaturity"
                name="vendorMaturity"
                value={companyProfile.vendorMaturity || ""}
                onChange={handleChange}
                default_option="Select vendor maturity stage"
                options={VENDOR_MATURITY_LEVELS}
                required
              />
            </FormField>
          </div>
        </div>

        <div className="step_form_left">
          <div className="form_fields_vendor">
            <FormField
              label="Company Website"
              mandatory={true}
              tooltipText={VENDOR_HELPTEXT.companyWebsite}
              errorText={fieldErrors.companyWebsite}
            >
              <Input
                labelName=""
                type="text"
                id="companyWebsite"
                name="companyWebsite"
                value={companyProfile.companyWebsite || ""}
                onChange={handleChange}
              />
            </FormField>
          </div>
          <div className="form_fields_vendor">
            <FormField
              label="Brief Company Description"
              mandatory={true}
              tooltipText={VENDOR_HELPTEXT.companyDescription}
              errorText={fieldErrors.companyDescription}
            >
              <Input
                labelName=""
                type="textarea"
                id="companyDescription"
                name="companyDescription"
                value={companyProfile.companyDescription || ""}
                onChange={handleChange}
              />
            </FormField>
          </div>
          <div className="form_fields_vendor">
            <FormField
              label="Approximate Number of Employees"
              mandatory={true}
              tooltipText="Select the range that includes your total headcount"
              errorText={fieldErrors.employeeCount}
            >
              <Select
                labelName=""
                id="employeeCount"
                name="employeeCount"
                value={companyProfile.employeeCount || ""}
                onChange={handleChange}
                default_option="Select employee count"
                options={EMPLOYEE_COUNTS}
                required
              />
            </FormField>
          </div>
          <div className="form_fields_vendor">
            <FormField
              label="Year Company Founded"
              mandatory={true}
              tooltipText="Enter 4-digit year (e.g., 2018)"
              errorText={fieldErrors.yearFounded}
            >
              <YearPicker
                startYear={1950}
                endYear={currentYear}
                id="yearFounded"
                name="yearFounded"
                value={companyProfile.yearFounded ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : "";
                  setCompanyProfile((prev) => ({ ...prev, yearFounded: v }));
                }}
              />
            </FormField>
          </div>
          <div className="form_fields_vendor">
            <FormField
              label="Headquarters Location"
              mandatory={true}
              tooltipText={VENDOR_HELPTEXT.headquartersLocation}
              errorText={fieldErrors.headquartersLocation}
            >
              <Select
                labelName=""
                id="headquartersLocation"
                name="headquartersLocation"
                value={companyProfile.headquartersLocation || ""}
                onChange={handleChange}
                default_option="Select headquarter location"
                options={HEADQUARTERS_LOCATION}
                required
              />
            </FormField>
          </div>
          <div className="form_fields_vendor">
            <FormField
              label="Geographic Regions Where You Operate"
              mandatory={true}
              tooltipText={VENDOR_HELPTEXT.operatingRegions}
              errorText={fieldErrors.operatingRegions}
            >
              <ChipMultiSelect
                id="operatingRegions"
                description="Select all geographic regions where you actively operate or serve customers"
                options={OPERATING_REGIONS}
                value={companyProfile.operatingRegions ?? []}
                globalExclusiveValue={VENDOR_OPERATING_REGIONS_GLOBAL_VALUE}
                onChange={(selected) =>
                  setCompanyProfile((prev) => ({ ...prev, operatingRegions: selected }))
                }
              />
            </FormField>
          </div>
        </div>
      </div>
    </>
  );
};

export default StepCompanyProfileAttestation;

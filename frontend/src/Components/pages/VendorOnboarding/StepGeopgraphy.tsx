import HeaderForVendor from "./HeaderForVendor";
import Select from "../../UI/Select";
import ChipMultiSelect from "../../UI/ChipMultiSelect";
import Input from "../../UI/Input";
import { useState } from "react";
import {
  HEADQUARTERS_LOCATION,
  OPERATING_REGIONS,
  VENDOR_HELPTEXT,
  VENDOR_OPERATING_REGIONS_GLOBAL_VALUE,
} from "../../../constants/vendorOnboardingData";
import type { StepPropsVendorData } from "../../../types/formDataVendor";
import { Globe, Info } from "lucide-react";
import ClickTooltip from "../../UI/ClickTooltip";
import FieldError from "../../UI/FieldError";

const StepGeography = ({
  formVendorData,
  setFormVendorData,
  fieldErrors,
}: StepPropsVendorData) => {
  const [isVisibleInput, setIsVisibleInput] = useState(false);
  const [customHeadquarter, setCustomHeadquarter] = useState("");
  const [selectedHeadquarter, setSelectedHeadquarter] = useState("");

  const handleHeadquartersChange = (val: string) => {
    setSelectedHeadquarter(val);
    if (val === "Other (Specify)") {
      setIsVisibleInput(true);
      setCustomHeadquarter("");
      setFormVendorData({ ...formVendorData, headquartersLocation: "" });
    } else {
      setIsVisibleInput(false);
      setCustomHeadquarter(val);
      setFormVendorData({ ...formVendorData, headquartersLocation: val });
    }
  };

  return (
    <>
    <div className="step_form_body">

<HeaderForVendor
        icon=<Globe/>
        className="header_for_vendor"
        title_vendor="Geography"
        sub_title_vendor="Where do you operate?"
      />

      {/* Headquarters Location */}
      <div className="form_fields_vendor">
        <Select
          labelName={
            <div className="labelSection">
              <span>Headquarters Location</span>
              <sup className="form_field_mandatory_asterisk" aria-hidden="true">*</sup>
              <ClickTooltip content={VENDOR_HELPTEXT.headquartersLocation}>
                <Info size={14} color="#6B7280" />
              </ClickTooltip>
            </div>
          }
          id="headquartersLocation"
          name="headquartersLocation"
          options={HEADQUARTERS_LOCATION}
          value={selectedHeadquarter}
          default_option="Select headquarter location"
          onChange={(e) => handleHeadquartersChange(e.target.value)}
        />
        {fieldErrors?.headquartersLocation && (
          <FieldError message={fieldErrors.headquartersLocation} />
        )}
      </div>

      {isVisibleInput && (
        <div className="form_fields_vendor">
          <Input
            labelName={
              <div className="labelSection">
                <span>Specify Location</span>
                <sup className="form_field_mandatory_asterisk" aria-hidden="true">*</sup>
                {/* <ClickTooltip content={VENDOR_HELPTEXT.customHeadquarter}>
                  <Info size={14} color="#6B7280" />
                </ClickTooltip> */}
              </div>
            }
            id="custom_headquarter"
            name="headquartersLocation"
            value={customHeadquarter}
            onChange={(e) => {
              setCustomHeadquarter(e.target.value);
              setFormVendorData({
                ...formVendorData,
                headquartersLocation: e.target.value,
              });
            }}
          />
        </div>
      )}

      {/* Operating Regions */}
      <div className="form_fields_vendor">
        <ChipMultiSelect
          id="operatingRegions"
          labelName={
            <div className="labelSection">
              <span>Operating Regions</span>
              <sup className="form_field_mandatory_asterisk" aria-hidden="true">*</sup>
              <ClickTooltip content={VENDOR_HELPTEXT.operatingRegions}>
                <Info size={14} color="#6B7280" />
              </ClickTooltip>
            </div>
          }
          description="Select all geographic regions where you actively operate or serve customers"
          options={OPERATING_REGIONS}
          value={formVendorData.operatingRegions ?? []}
          globalExclusiveValue={VENDOR_OPERATING_REGIONS_GLOBAL_VALUE}
          onChange={(selected) =>
            setFormVendorData({ ...formVendorData, operatingRegions: selected })
          }
        />
        {fieldErrors?.operatingRegions && (
          <FieldError message={fieldErrors.operatingRegions} />
        )}
      </div>
    </div>
      
    </>
  );
};

export default StepGeography;

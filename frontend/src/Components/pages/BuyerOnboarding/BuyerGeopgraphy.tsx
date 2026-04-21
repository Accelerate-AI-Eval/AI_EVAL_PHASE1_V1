import React, { useState, useEffect } from "react";
import Input from "../../UI/Input";
import HeaderForBuyer from "./HeaderForBuyer";
import Select from "../../UI/Select";
import ChipMultiSelect from "../../UI/ChipMultiSelect";
import ClickTooltip from "../../UI/ClickTooltip";
import FieldError from "../../UI/FieldError";
import { Info } from "lucide-react";
import {
  BUYER_DATA_RESIDENCY_REQUIREMENTS,
  BUYER_HEADQUARTERS_LOCATION,
  BUYER_OPERATING_REGIONS,
  BUYER_OPERATING_REGIONS_GLOBAL_VALUE,
  BUYER_HELPTEXT,
} from "../../../constants/buyerOnboardingData";
import type { StepPropsBuyerrData } from "../../../types/formDataBuyer";

const BuyerGeography = ({
  formBuyerData,
  setFormBuyerData,
  fieldErrors,
  title,
  subTitle,
  icon,
}: StepPropsBuyerrData) => {
  const [isVisibleInput, setIsVisibleInput] = useState(false);
  const [customHeadquarter, setCustomHeadquarter] = useState("");
  const [selectedHeadquarter, setSelectedHeadquarter] = useState("");

  const isOtherSpecify = (v: string) => v === "Other (specify)";

  useEffect(() => {
    const id = window.setTimeout(() => {
      const hq = formBuyerData.headquartersLocation || "";
      if (isOtherSpecify(hq)) {
        setSelectedHeadquarter("Other (specify)");
        setIsVisibleInput(true);
        setCustomHeadquarter("");
      } else if (hq) {
        const inOptions = BUYER_HEADQUARTERS_LOCATION.some((o) => o.value === hq);
        if (inOptions) {
          setSelectedHeadquarter(hq);
          setIsVisibleInput(false);
          setCustomHeadquarter("");
        } else {
          setSelectedHeadquarter("Other (specify)");
          setIsVisibleInput(true);
          setCustomHeadquarter(hq);
        }
      }
    }, 0);
    return () => clearTimeout(id);
  }, [formBuyerData.headquartersLocation]);

  const handleHeadquartersChange = (val: string) => {
    setSelectedHeadquarter(val);
    if (val === "Other (specify)") {
      setIsVisibleInput(true);
      setCustomHeadquarter("");
      setFormBuyerData({ ...formBuyerData, headquartersLocation: "" });
    } else {
      setIsVisibleInput(false);
      setCustomHeadquarter("");
      setFormBuyerData({ ...formBuyerData, headquartersLocation: val });
    }
  };

  return (
    <>
      <HeaderForBuyer
        className="header_for_vendor"
        title_vendor={title ?? "Geography"}
        sub_title_vendor={subTitle}
        icon={icon}
      />

      <div className="form_fields_vendor">
        <Select
          labelName={
            <div className="labelSection">
              <span>Headquarters Location</span>
              <sup className="form_field_mandatory_asterisk" aria-hidden="true">*</sup>
              <ClickTooltip content={BUYER_HELPTEXT.headquartersLocation}>
                <Info size={14} color="#6B7280" />
              </ClickTooltip>
            </div>
          }
          id="headquarters_loc"
          name="headquartersLocation"
          required
          options={BUYER_HEADQUARTERS_LOCATION}
          value={selectedHeadquarter}
          default_option="Select headquarter location"
          onChange={(e) => handleHeadquartersChange(e.target.value)}
        />
        {fieldErrors?.headquartersLocation && (
          <FieldError message={fieldErrors.headquartersLocation} />
        )}
      </div>

      {isVisibleInput && (
        <div className="form_fields_vendor" style={{ marginTop: "0.5rem" }}>
          <Input
            labelName={
              <div className="labelSection">
                <span>Specify location</span>
                <sup className="form_field_mandatory_asterisk" aria-hidden="true">*</sup>
              </div>
            }
            id="custom_headquarter"
            name="headquartersLocation"
            value={customHeadquarter}
            placeholder="Enter your headquarters location"
            onChange={(e) => {
              setCustomHeadquarter(e.target.value);
              setFormBuyerData({
                ...formBuyerData,
                headquartersLocation: e.target.value,
              });
            }}
          />
        </div>
      )}
      <div className="form_fields_vendor">
        <ChipMultiSelect
          id="operatingRegions"
          labelName={
            <div className="labelSection">
              <span>Operating Regions</span>
              <sup className="form_field_mandatory_asterisk" aria-hidden="true">*</sup>
              <ClickTooltip content={BUYER_HELPTEXT.operatingRegions}>
                <Info size={14} color="#6B7280" />
              </ClickTooltip>
            </div>
          }
          options={BUYER_OPERATING_REGIONS}
          value={formBuyerData.operatingRegions || []}
          globalExclusiveValue={BUYER_OPERATING_REGIONS_GLOBAL_VALUE}
          onChange={(selected: string[]) =>
            setFormBuyerData({ ...formBuyerData, operatingRegions: selected })
          }
        />
        {fieldErrors?.operatingRegions && (
          <FieldError message={fieldErrors.operatingRegions} />
        )}
      </div>

      <div className="form_fields_vendor">
        <ChipMultiSelect
          id="dataResidency"
          labelName={
            <div className="labelSection">
              <span>Data Residency Requirements</span>
              <sup className="form_field_mandatory_asterisk" aria-hidden="true">*</sup>
              <ClickTooltip content={BUYER_HELPTEXT.dataResidencyRequirements}>
                <Info size={14} color="#6B7280" />
              </ClickTooltip>
            </div>
          }
          options={BUYER_DATA_RESIDENCY_REQUIREMENTS}
          value={formBuyerData.dataResidencyRequirements || []}
          onChange={(selected: string[]) =>
            setFormBuyerData({ ...formBuyerData, dataResidencyRequirements: selected })
          }
        />
        {fieldErrors?.dataResidencyRequirements && (
          <FieldError message={fieldErrors.dataResidencyRequirements} />
        )}
      </div>
    </>
  );
};

export default BuyerGeography;

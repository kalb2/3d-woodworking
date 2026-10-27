import React from 'react';
import type { LengthUnit } from '../../types/furniture';
import { unitScale } from '../../utils/units';
import { fieldUnit, inchFraction, metricNumber } from '../../utils/lengthFormat';
import { NumberField, type NumberFieldProps } from './NumberField';

export interface LengthFieldProps extends Omit<NumberFieldProps, 'value' | 'onCommit' | 'min' | 'max' | 'format' | 'fractions' | 'integer' | 'onPreview'> {
  /** Current length in stored inches. */
  inches: number;
  unit: LengthUnit;
  onCommit: (inches: number) => void;
  onPreview?: (inches: number | null) => void;
  /** Limits in inches. */
  min?: number;
  max?: number;
  /** Show the unit after metric values (imperial values carry their own " mark). */
  unitSuffix?: boolean;
  unitClassName?: string;
}

/**
 * The one length input. In/ft projects type and see inches with 1/16 fractions
 * (23 5/8") and get the fraction bar above the keypad; metric projects type and
 * see mm or cm. Takes and returns stored inches.
 */
export const LengthField: React.FC<LengthFieldProps> = ({ inches, unit, onCommit, onPreview, min, max, unitSuffix = true, unitClassName = 'props-unit', ...rest }) => {
  const fu = fieldUnit(unit), k = unitScale(fu), imperial = fu === 'in';
  const field = (
    <NumberField
      {...rest}
      className={imperial ? `${rest.className ?? ''} is-frac`.trim() : rest.className}
      fractions={imperial}
      min={min !== undefined ? min * k : undefined}
      max={max !== undefined ? max * k : undefined}
      value={inches * k}
      format={() => (imperial ? `${inchFraction(inches)}"` : metricNumber(inches, fu))}
      onCommit={(n) => onCommit(n / k)}
      onPreview={onPreview ? (n) => onPreview(n === null ? null : n / k) : undefined}
    />
  );
  if (imperial || !unitSuffix) return field;
  return <>{field}<span className={unitClassName}>{fu}</span></>;
};

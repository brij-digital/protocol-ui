import type { RuntimeOperationSummary } from '@brij-digital/apppack-runtime/runtimeOperationRuntime';

export type InputUiHints = {
  label: string;
  placeholder?: string;
  help?: string;
  group?: string;
  displayOrder?: number;
};

export type InputValidationHints = {
  required?: boolean;
};

export type OperationEnhancement = {
  label: string;
  inputUi: Record<string, InputUiHints>;
  inputValidation: Record<string, InputValidationHints>;
};

export function buildOperationEnhancementFromSummary(
  operation: RuntimeOperationSummary,
): OperationEnhancement {
  const inputUi: OperationEnhancement['inputUi'] = {};
  const inputValidation: OperationEnhancement['inputValidation'] = {};

  for (const [inputName, inputSpec] of Object.entries(operation.inputs)) {
    inputUi[inputName] = {
      label: inputName,
    };

    inputValidation[inputName] = {
      ...(typeof inputSpec.required === 'boolean' ? { required: inputSpec.required } : {}),
    };
  }

  return {
    label: operation.operationId,
    inputUi,
    inputValidation,
  };
}

export function validateOperationInput(options: {
  operation: RuntimeOperationSummary;
  input: Record<string, unknown>;
  enhancement?: OperationEnhancement;
}): string[] {
  const errors: string[] = [];
  const inputUi = options.enhancement?.inputUi ?? {};
  const inputValidation = options.enhancement?.inputValidation ?? {};

  for (const [inputName, inputSpec] of Object.entries(options.operation.inputs)) {
    const label = inputUi[inputName]?.label ?? inputName;
    const value = options.input[inputName];
    const validate = inputValidation[inputName] ?? {};

    if ((inputSpec.required || validate.required) && (value === undefined || value === null || value === '')) {
      errors.push(`${label} is required.`);
      continue;
    }

    if (value === undefined || value === null || value === '') {
      continue;
    }
  }

  return errors;
}

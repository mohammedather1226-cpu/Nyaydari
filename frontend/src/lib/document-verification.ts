export type VerificationStatus =
  | "matched"
  | "needs_review"
  | "mismatch"
  | "unreadable";

export type VerificationResult = {
  status: VerificationStatus;
  explanation: string;
};

const checklistByCategory: Record<string, readonly string[]> = {
  rental_property: [
    "Rental or lease agreement",
    "Rent and security-deposit payment records",
    "Written communications with the landlord or property manager",
    "Repair requests, notices, or property-condition records",
  ],
  employment: [
    "Employment agreement or offer letter",
    "Recent payslips or wage records",
    "Work-related notices or communications",
    "Records of hours worked or attendance",
  ],
  consumer: [
    "Receipt, invoice, or order confirmation",
    "Warranty or service terms",
    "Written communications with the seller or service provider",
    "Photos or records documenting the product or service issue",
  ],
};

type DocumentRule = {
  label: string;
  indicators: readonly RegExp[];
  minimumIndicators?: number;
  requiredIndicators?: readonly number[];
};

const rulesByCategory: Record<string, Record<string, DocumentRule>> = {
  rental_property: {
    "Rental or lease agreement": {
      label: "rental agreement",
      requiredIndicators: [0],
      indicators: [
        /\b(?:rental|lease|tenancy)\s+agreement\b|\b(?:lease|tenancy)\s+contract\b/i,
        /\b(?:landlord|lessor)\b/i,
        /\b(?:tenant|lessee|renter)\b/i,
        /\b(?:monthly rent|security deposit|rental period|lease term|property address)\b/i,
      ],
    },
    "Rent and security-deposit payment records": {
      label: "rental payment record",
      minimumIndicators: 3,
      requiredIndicators: [0, 2],
      indicators: [
        /\b(?:transaction|payment|receipt|transfer|upi|bank reference|transaction id)\b/i,
        /\b(?:amount|paid|payment date|date of payment|total)\b/i,
        /\b(?:security deposit|rental deposit|rent|tenancy)\b/i,
        /\b(?:landlord|property manager|tenant|rental property)\b/i,
      ],
    },
    "Written communications with the landlord or property manager": {
      label: "communication with a landlord or property manager",
      requiredIndicators: [0, 1],
      indicators: [
        /\b(?:dear|from:|to:|subject:|message|email|whatsapp)\b/i,
        /\b(?:landlord|property manager|tenant|renter)\b/i,
        /\b(?:requested|replied|responded|please|regarding|following up)\b/i,
      ],
    },
    "Repair requests, notices, or property-condition records": {
      label: "property repair or condition record",
      requiredIndicators: [0],
      indicators: [
        /\b(?:repair|maintenance|inspection|condition report|damage|leak|mould|mold)\b/i,
        /\b(?:property|apartment|house|rental|tenant|landlord)\b/i,
        /\b(?:reported|request|notice|photograph|before|after|issue)\b/i,
      ],
    },
  },
  employment: {
    "Employment agreement or offer letter": {
      label: "employment agreement or offer letter",
      requiredIndicators: [0],
      indicators: [
        /\b(?:employment|appointment|offer)\s+(?:agreement|letter)\b|\bterms of employment\b/i,
        /\b(?:employer|company|employee|candidate)\b/i,
        /\b(?:position|job title|role|joining date|start date)\b/i,
        /\b(?:salary|wage|compensation|work location|notice period)\b/i,
      ],
    },
    "Recent payslips or wage records": {
      label: "salary or wage record",
      minimumIndicators: 3,
      requiredIndicators: [0],
      indicators: [
        /\b(?:salary|wage|payroll|payslip|pay slip|earnings)\b/i,
        /\b(?:employee name|employee id|employee number|staff id)\b/i,
        /\b(?:employer|company|pay period|salary period|month of)\b/i,
        /\b(?:net pay|gross pay|deduction|amount paid|payment date)\b/i,
      ],
    },
    "Work-related notices or communications": {
      label: "employment-related communication",
      requiredIndicators: [0, 1],
      indicators: [
        /\b(?:email|message|letter|notice|communication|from:|to:|subject:)\b/i,
        /\b(?:employer|employee|manager|human resources|hr department)\b/i,
        /\b(?:resignation|termination|salary|workplace|employment|attendance)\b/i,
      ],
    },
    "Records of hours worked or attendance": {
      label: "work-hours or attendance record",
      requiredIndicators: [0],
      indicators: [
        /\b(?:attendance|timesheet|time sheet|working hours|hours worked|clock in|clock out)\b/i,
        /\b(?:employee|staff|worker|employer|company)\b/i,
        /\b(?:date|shift|total hours|overtime|present|absent)\b/i,
      ],
    },
  },
  consumer: {
    "Receipt, invoice, or order confirmation": {
      label: "purchase invoice or receipt",
      minimumIndicators: 3,
      requiredIndicators: [0, 1],
      indicators: [
        /\b(?:invoice|tax invoice|receipt|order confirmation|purchase order)\b/i,
        /\b(?:seller|merchant|store|supplier|vendor)\b/i,
        /\b(?:invoice number|receipt number|order number|transaction id)\b/i,
        /\b(?:product|item|description|quantity|total amount|purchase date)\b/i,
      ],
    },
    "Warranty or service terms": {
      label: "warranty or service terms",
      requiredIndicators: [0],
      indicators: [
        /\b(?:warranty|guarantee|service terms|terms and conditions|service plan)\b/i,
        /\b(?:coverage|covered|exclusions|repair|replacement|valid until)\b/i,
        /\b(?:product|service|manufacturer|provider|customer)\b/i,
      ],
    },
    "Written communications with the seller or service provider": {
      label: "communication with a seller or service provider",
      requiredIndicators: [0, 1],
      indicators: [
        /\b(?:email|message|letter|complaint|from:|to:|subject:)\b/i,
        /\b(?:seller|merchant|service provider|customer support|company)\b/i,
        /\b(?:refund|return|replacement|defect|service|request|response)\b/i,
      ],
    },
    "Photos or records documenting the product or service issue": {
      label: "product or service issue record",
      requiredIndicators: [0],
      indicators: [
        /\b(?:product complaint|defective|damaged|faulty|not working|service issue)\b/i,
        /\b(?:product|item|service|model|serial number)\b/i,
        /\b(?:reported|issue|damage|description|date|photograph|photo)\b/i,
      ],
    },
  },
};

const unrelatedDocumentRules: readonly DocumentRule[] = [
  {
    label: "bank statement",
    indicators: [
      /\b(?:bank statement|account statement|statement period)\b/i,
      /\b(?:opening balance|closing balance|account number|available balance)\b/i,
      /\b(?:debit|credit|withdrawal|deposit|transaction date)\b/i,
    ],
  },
  {
    label: "medical record",
    indicators: [
      /\b(?:medical report|patient|diagnosis|clinical|hospital)\b/i,
      /\b(?:doctor|physician|prescription|treatment|medical record)\b/i,
    ],
  },
];

function indicatorCount(text: string, indicators: readonly RegExp[]) {
  return indicators.reduce(
    (count, indicator) => count + Number(indicator.test(text)),
    0,
  );
}

function hasRuleEvidence(rule: DocumentRule, text: string) {
  const requiredIndicators = rule.minimumIndicators ?? 2;
  const hasRequiredIndicators = (rule.requiredIndicators ?? []).every((index) =>
    rule.indicators[index].test(text),
  );
  return (
    indicatorCount(text, rule.indicators) >= requiredIndicators &&
    hasRequiredIndicators
  );
}

export function isSupportedDocumentType(category: string, documentType: string) {
  if (!Object.prototype.hasOwnProperty.call(checklistByCategory, category)) {
    return false;
  }
  return checklistByCategory[category].includes(documentType);
}

export function verifyDocumentType(
  category: string,
  documentType: string,
  text: string,
): VerificationResult {
  if (!text.trim()) {
    return {
      status: "unreadable",
      explanation: "The PDF has no extractable text. Upload a text-based PDF or review the file yourself.",
    };
  }

  const categoryRules = Object.prototype.hasOwnProperty.call(
    rulesByCategory,
    category,
  )
    ? rulesByCategory[category]
    : undefined;
  const requestedRule =
    categoryRules &&
    Object.prototype.hasOwnProperty.call(categoryRules, documentType)
      ? categoryRules[documentType]
      : undefined;
  if (!requestedRule) {
    return {
      status: "needs_review",
      explanation: "The requested checklist type could not be verified. Please review the document yourself.",
    };
  }

  const requestedMatches = hasRuleEvidence(requestedRule, text);
  if (requestedMatches) {
    return {
      status: "matched",
      explanation: `The extracted text contains several indicators associated with a ${requestedRule.label}. This is a preliminary type match only.`,
    };
  }

  const otherRules = [
    ...Object.entries(rulesByCategory).flatMap(([ruleCategory, rules]) =>
      Object.entries(rules)
        .filter(
          ([otherType]) =>
            ruleCategory !== category || otherType !== documentType,
        )
        .map(([, rule]) => rule),
    ),
    ...unrelatedDocumentRules,
  ];
  const likelyOtherType = otherRules.find(
    (rule) => hasRuleEvidence(rule, text),
  );

  if (likelyOtherType && !requestedMatches) {
    return {
      status: "mismatch",
      explanation: `The extracted text appears more consistent with a ${likelyOtherType.label} than the requested ${requestedRule.label}. Please review or replace the file.`,
    };
  }

  return {
    status: "needs_review",
    explanation: `Some text was extracted, but it does not provide enough indicators to determine whether this is a ${requestedRule.label}. Please review it yourself.`,
  };
}

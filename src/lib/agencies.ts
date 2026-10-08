import type { Bureau } from "./types";

// Mailing addresses change. They are prefilled as a convenience and every
// letter's recipient block is editable — verify against the agency's site
// before mailing.
export const BUREAU_ADDRESS: Record<Bureau, { name: string; address: string }> = {
  Equifax: {
    name: "Equifax Information Services LLC",
    address: "P.O. Box 740256\nAtlanta, GA 30374-0256",
  },
  Experian: { name: "Experian", address: "P.O. Box 4500\nAllen, TX 75013" },
  TransUnion: {
    name: "TransUnion Consumer Solutions",
    address: "P.O. Box 2000\nChester, PA 19016-2000",
  },
};

export interface Agency {
  key: string;
  name: string;
  what: string;
  /** Mailing address for freeze requests, first line = recipient name. */
  address: string;
  phone: string;
  url: string;
  /** False when the agency only takes freeze requests by mail or phone. */
  online: boolean;
}

// Every link, address and phone below was checked on the agency's own freeze page on 2026-10-07,
// cross-referenced with the CFPB's List of Consumer Reporting Companies. Where they differed, the agency's
// own page wins (it is more current). Agencies move, merge and rename: re-check at least once a year.
export const AGENCY_SOURCE = "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/consumer-reporting-companies/";
export const AGENCIES_CHECKED = "October 2026";

export const SECONDARY_AGENCIES: Agency[] = [
  {
    key: "lexisnexis",
    name: "LexisNexis Risk Solutions",
    what: "Public records, insurance and identity data used by lenders and insurers. Also covers SageStream.",
    address: "LexisNexis Risk Solutions\nConsumer Center\nP.O. Box 105108\nAtlanta, GA 30348-5108",
    phone: "800-456-1244",
    url: "https://consumer.risk.lexisnexis.com/freeze",
    online: true,
  },
  {
    key: "innovis",
    name: "Innovis",
    what: "The 'fourth bureau', used for identity verification and some lending decisions.",
    address: "Innovis Consumer Assistance\nP.O. Box 530088\nAtlanta, GA 30353-0088",
    phone: "800-540-2505",
    url: "https://www.innovis.com/personal/securityFreeze",
    online: true,
  },
  {
    key: "chexsystems",
    name: "ChexSystems",
    what: "Bank account history: closures, overdrafts, unpaid fees.",
    address: "Chex Systems, Inc.\nAttn: Consumer Relations\nP.O. Box 583399\nMinneapolis, MN 55458",
    phone: "800-428-9623",
    url: "https://www.chexsystems.com/security-freeze/place-freeze",
    online: true,
  },
  {
    key: "clarity",
    name: "Clarity Services (Experian)",
    what: "Payday, installment, rent-to-own and subprime loan history.",
    address: "Clarity Services, Inc.\nConsumer Support Division\nP.O. Box 16\nAllen, TX 75013",
    phone: "866-390-3118 (option 1)",
    url: "https://www.clarityservices.com/support/security-freeze/",
    online: true,
  },
  {
    key: "datax",
    name: "DataX, incl. Teletrack (Equifax)",
    what: "Payday, installment, rent-to-own and subprime loan history. Teletrack is now part of DataX.",
    address: "DataX, Ltd.\nP.O. Box 740124\nAtlanta, GA 30374",
    phone: "800-295-4790",
    url: "https://consumers.dataxltd.com/consumerCreditFreeze",
    online: true,
  },
  {
    key: "factortrust",
    name: "FactorTrust (TransUnion)",
    what: "Short-term, installment and nonprime auto loan history.",
    address: "FactorTrust - Freeze Requests\nP.O. Box 57\nWoodlyn, PA 19094",
    phone: "844-773-3321",
    url: "https://www.factortrust.com/Consumer/CreditFreeze/Landing.aspx",
    online: true,
  },
  {
    key: "microbilt",
    name: "MicroBilt",
    what: "Rent, utility, phone and subscription payment data used by short-term and rent-to-own lenders. Freezes by mailed form.",
    address: "MicroBilt\nAttn: Consumer Affairs Department\nP.O. Box 440693\nKennesaw, GA 30160",
    phone: "888-222-7621",
    url: "https://www.microbilt.com/consumer-affairs",
    online: false,
  },
  {
    key: "nctue",
    name: "NCTUE",
    what: "Telecom, pay-TV and utility account history.",
    address: "Exchange Service Center - NCTUE\nSecurity Freeze\nP.O. Box 105561\nAtlanta, GA 30348",
    phone: "866-349-5355",
    url: "https://nctue.com/consumer/",
    online: true,
  },
];

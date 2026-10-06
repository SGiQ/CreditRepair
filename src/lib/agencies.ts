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
  address: string;
  url: string;
}

export const SECONDARY_AGENCIES: Agency[] = [
  {
    key: "lexisnexis",
    name: "LexisNexis Risk Solutions",
    what: "Public records, insurance and identity data resold to lenders and the big three. Also handles SageStream freezes.",
    address: "LexisNexis Risk Solutions Consumer Center\nAttn: Security Freeze\nP.O. Box 105108\nAtlanta, GA 30348-5108",
    url: "https://consumer.risk.lexisnexis.com/freeze",
  },
  {
    key: "innovis",
    name: "Innovis",
    what: "The 'fourth bureau' — used for identity verification and some lending decisions.",
    address: "Innovis Consumer Assistance\nP.O. Box 530088\nAtlanta, GA 30353-0088",
    url: "https://www.innovis.com/personal/securityFreeze",
  },
  {
    key: "chexsystems",
    name: "ChexSystems",
    what: "Bank account history — closures, overdrafts, unpaid fees.",
    address: "Chex Systems, Inc.\nAttn: Security Freeze\nP.O. Box 583399\nMinneapolis, MN 55458",
    url: "https://www.chexsystems.com/security-freeze/place-freeze",
  },
  {
    key: "corelogic",
    name: "CoreLogic Credco",
    what: "Merged credit files, property and rental data.",
    address: "CoreLogic Credco, LLC\nAttn: Consumer Relations\nP.O. Box 509124\nSan Diego, CA 92150",
    url: "https://www.corelogic.com/intelligent-solutions/consumer-assistance/",
  },
  {
    key: "ars",
    name: "Advanced Resolution Services (ARS)",
    what: "Identity verification data used by card issuers.",
    address: "Advanced Resolution Services, Inc.\n5005 Rockside Road, Suite 600\nIndependence, OH 44131",
    url: "https://www.ars-consumeroffice.com/",
  },
  {
    key: "clarity",
    name: "Clarity Services (Experian)",
    what: "Subprime, payday and installment loan history.",
    address: "Clarity Services, Inc.\nAttn: Consumer Support\nP.O. Box 5717\nClearwater, FL 33758",
    url: "https://www.clarityservices.com/support/",
  },
  {
    key: "nctue",
    name: "NCTUE",
    what: "Telecom, pay-TV and utility account history.",
    address: "NCTUE Security Freeze\nP.O. Box 105561\nAtlanta, GA 30348",
    url: "https://www.nctue.com/consumers",
  },
  {
    key: "datax",
    name: "DataX (Equifax)",
    what: "Alternative credit data — short-term and online lending.",
    address: "DataX, Ltd.\nAttn: Consumer Support\n325 E. Warm Springs Road, Suite 202\nLas Vegas, NV 89119",
    url: "https://consumers.dataxltd.com/",
  },
  {
    key: "factortrust",
    name: "FactorTrust (TransUnion)",
    what: "Alternative credit data on short-term loans.",
    address: "FactorTrust, Inc.\nAttn: Consumer Inquiry\nP.O. Box 3653\nAlpharetta, GA 30023",
    url: "https://www.factortrust.com/consumer/",
  },
  {
    key: "microbilt",
    name: "MicroBilt / PRBC",
    what: "Alternative credit and rental payment data.",
    address: "MicroBilt Corporation\nAttn: Consumer Affairs\n1640 Airport Road, Suite 115\nKennesaw, GA 30144",
    url: "https://www.microbilt.com/us/consumer-affairs",
  },
];

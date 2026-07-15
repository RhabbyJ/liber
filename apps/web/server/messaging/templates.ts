import { MessagingError } from "./errors";

export type MessagingParticipantRole = "BUYER" | "SELLER";
export type MessagingTemplateUse = "OPENING" | "QUICK_REPLY" | "SELLER_FOLLOW_UP";

export type MessagingTemplate = {
  key: string;
  role: MessagingParticipantRole;
  text: string;
  uses: readonly MessagingTemplateUse[];
  version: number;
};

const templates: readonly MessagingTemplate[] = [
  {
    key: "SELLER_PRIVATE_VIEWING",
    role: "SELLER",
    text: "Would you like to schedule a private viewing of this property?",
    uses: ["OPENING", "SELLER_FOLLOW_UP"],
    version: 1,
  },
  {
    key: "SELLER_MORE_DETAILS",
    role: "SELLER",
    text: "Would you like more photos or property details?",
    uses: ["OPENING", "SELLER_FOLLOW_UP"],
    version: 1,
  },
  {
    key: "SELLER_TIMING_AND_PLANS",
    role: "SELLER",
    text: "Does this property appear to fit your timing and purchase plans?",
    uses: ["OPENING", "SELLER_FOLLOW_UP"],
    version: 1,
  },
  {
    key: "SELLER_NEXT_STEPS",
    role: "SELLER",
    text: "Would you like to discuss the property and possible next steps?",
    uses: ["OPENING", "SELLER_FOLLOW_UP"],
    version: 1,
  },
  {
    key: "BUYER_SCHEDULE_VIEWING",
    role: "BUYER",
    text: "I would like to schedule a viewing.",
    uses: ["QUICK_REPLY"],
    version: 1,
  },
  {
    key: "BUYER_MORE_DETAILS",
    role: "BUYER",
    text: "Please send more property details.",
    uses: ["QUICK_REPLY"],
    version: 1,
  },
  {
    key: "BUYER_PROPERTY_CONDITION",
    role: "BUYER",
    text: "What condition is the property in?",
    uses: ["QUICK_REPLY"],
    version: 1,
  },
  {
    key: "BUYER_INTERESTED_QUESTIONS",
    role: "BUYER",
    text: "I am interested and have a few questions.",
    uses: ["QUICK_REPLY"],
    version: 1,
  },
  {
    key: "BUYER_NOT_A_FIT",
    role: "BUYER",
    text: "This property is not a fit for me.",
    uses: ["QUICK_REPLY"],
    version: 1,
  },
];

const templateByIdentity = new Map(
  templates.map((template) => [`${template.key}:${template.version}`, template] as const),
);

export const sellerOpeningTemplates = templates.filter(
  (template) => template.role === "SELLER" && template.uses.includes("OPENING"),
);
export const sellerFollowUpTemplates = templates.filter(
  (template) => template.role === "SELLER" && template.uses.includes("SELLER_FOLLOW_UP"),
);
export const buyerQuickReplyTemplates = templates.filter(
  (template) => template.role === "BUYER" && template.uses.includes("QUICK_REPLY"),
);

export function resolveMessagingTemplate(args: {
  key: string;
  role: MessagingParticipantRole;
  use?: MessagingTemplateUse;
  version: number;
}) {
  const template = templateByIdentity.get(`${args.key}:${args.version}`);
  if (!template || template.role !== args.role || (args.use && !template.uses.includes(args.use))) {
    throw new MessagingError("INVALID_INPUT", "Guided message template is unavailable.", 400);
  }
  return template;
}

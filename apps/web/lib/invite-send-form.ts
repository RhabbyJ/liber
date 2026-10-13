export type InviteSendFormState = {
  message: string;
  action?: { href: string; label: string };
  values?: { propertyId: string; termsAccepted: boolean };
};

export const initialInviteSendFormState: InviteSendFormState = { message: "" };

/** Inline result of a form Server Action that reports expected failures instead of throwing. */
export type ActionFeedbackState = {
  message: string;
  ok: boolean;
};

export const initialActionFeedback: ActionFeedbackState = { message: "", ok: false };

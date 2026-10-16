/**
 * The composer is disabled while a message sends, which drops its focus (and
 * closes a phone keyboard). Once it is enabled again, return focus to it unless
 * something else has deliberately taken focus: focus may only be on the page
 * itself, still on the composer, or stranded on a control that is disabled.
 */
export function restoreComposerFocus(
  composer: HTMLTextAreaElement | null,
  { activeElement, body }: { activeElement: Element | null; body: Element | null },
) {
  if (!composer || composer.disabled) return false;
  const focusMovedOn = activeElement !== null
    && activeElement !== body
    && activeElement !== composer
    && !activeElement.matches(":disabled");
  if (focusMovedOn) return false;
  composer.focus();
  return true;
}

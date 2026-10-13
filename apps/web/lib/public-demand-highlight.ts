export type PublicDemandPinHighlightTarget = {
  element: { classList: Pick<DOMTokenList, "toggle"> };
  previewIndexes: readonly number[];
};

export function syncPublicDemandPinHighlights(
  pins: readonly PublicDemandPinHighlightTarget[],
  activePreviewIndex: number | null,
) {
  pins.forEach(({ element, previewIndexes }) => {
    element.classList.toggle("active", activePreviewIndex !== null && previewIndexes.includes(activePreviewIndex));
  });
}

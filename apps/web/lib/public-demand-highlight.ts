export type PublicDemandPinHighlightTarget = {
  element: { classList: Pick<DOMTokenList, "toggle"> };
  previewIndex: number;
};

export function syncPublicDemandPinHighlights(
  pins: readonly PublicDemandPinHighlightTarget[],
  activePreviewIndex: number | null,
) {
  pins.forEach(({ element, previewIndex }) => {
    element.classList.toggle("active", previewIndex === activePreviewIndex);
  });
}

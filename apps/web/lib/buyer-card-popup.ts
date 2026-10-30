import { avatarColorIndex, avatarInitials } from "./avatar-variant";
import { DEMO_BUYER_LABEL, type BuyerCardView } from "./buyer-card-view";
import { escapeHtml } from "./map-presentation";

/** Map mini-card avatar: the same initials and palette color as the buyer's result card. */
export function buyerPopupAvatarHtml(view: BuyerCardView) {
  const color = avatarColorIndex(view.avatar.variant, view.avatar.seed);
  const initials = avatarInitials(view.avatar.name);
  return `<span class="map-card-avatar-cell"><span aria-hidden="true" class="generated-avatar map-card-avatar" data-avatar-color="${color}"><span class="generated-avatar-initials">${escapeHtml(initials)}</span></span></span>`;
}

/** Name, budget, needs, what and where, and the strongest trust signal; every value is escaped. */
export function buyerPopupDetailsHtml(view: BuyerCardView) {
  const trust = view.signals.find((signal) => signal.tone !== "neutral") ?? view.signals[0];
  const needs = view.needs.map((need) => escapeHtml(need.label));
  return [
    `<span class="map-card-name">${escapeHtml(view.name)}${view.isDemo ? ` <span class="map-card-demo">${DEMO_BUYER_LABEL}</span>` : ""}</span>`,
    `<strong class="map-card-price">${escapeHtml(view.budget)}</strong>`,
    needs.length > 0 ? `<span class="map-card-facts">${needs.join("<i></i>")}</span>` : "",
    `<span class="map-card-address">${escapeHtml(view.seeking.label)} · ${escapeHtml(view.area)}</span>`,
    trust ? `<span class="map-card-trust ${trust.tone}">${escapeHtml(trust.label)}</span>` : "",
  ].join("");
}

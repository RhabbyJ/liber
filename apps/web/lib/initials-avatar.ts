import { Avatar, Style, type StyleDefinition } from "@dicebear/core";
import initialsDefinition from "@dicebear/styles/initials.json";
import { resolveAvatarVariant } from "./avatar-variant";
import { publicIdentityInitialLetters } from "./public-identity";

const initialsStyle = new Style(initialsDefinition as StyleDefinition);
const colors = ["#234d43", "#345d72", "#66583e", "#575078", "#745058", "#3e6260", "#595e68", "#6e604a"];

export function createInitialsAvatar(name: string | null | undefined, seed: string, variant?: string | null) {
  const resolved = resolveAvatarVariant(variant, seed);
  const letters = publicIdentityInitialLetters(name);
  return new Avatar(initialsStyle, {
    // Whole graphemes (not code points) keep vowel signs and other marks, matching the accessible initials.
    seed: letters.length ? letters.join(" ") : "L",
    initialsVariant: "alt",
    lettersVariant: "double",
    backgroundColor: [colors[resolved.salt % colors.length]],
    textColor: ["#ffffff"],
    fontWeight: 600,
  }).toString();
}

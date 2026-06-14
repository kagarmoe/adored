type NameableItem = { name: string | null; number: number | null };

/** Human label for an item: its name, else its catalog number (#N), else "Untitled". */
export function itemDisplayName(item: NameableItem): string {
  const name = item.name?.trim();
  if (name) {
    return name;
  }
  return item.number != null ? `#${item.number}` : "Untitled";
}

/** Single-glyph avatar for an item with no photo: name initial, else a neutral mark. */
export function itemInitial(item: NameableItem): string {
  const name = item.name?.trim();
  return name ? name.charAt(0).toUpperCase() : "•";
}

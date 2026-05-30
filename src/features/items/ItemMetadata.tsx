import type { Item } from "@/types";

interface ItemMetadataProps {
  item: Item;
}

export function ItemMetadata({ item }: ItemMetadataProps) {
  const fields = [
    { label: "Brand", value: item.brand },
    { label: "Style", value: item.style },
    { label: "Color", value: item.color },
    { label: "Material", value: item.material },
    { label: "Category", value: item.category },
  ];

  const filledFields = fields.filter((f) => f.value);

  if (filledFields.length === 0 && !item.notes) {
    return <p className="text-sm text-gray-500">No details added yet</p>;
  }

  return (
    <div className="space-y-4">
      {filledFields.map((field) => (
        <div key={field.label}>
          <p className="text-xs font-medium text-gray-500 uppercase">{field.label}</p>
          <p className="mt-1 text-sm text-gray-900">{field.value}</p>
        </div>
      ))}
      {item.notes && (
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase">Notes</p>
          <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">{item.notes}</p>
        </div>
      )}
    </div>
  );
}

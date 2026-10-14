import json
from pathlib import Path

val_json_path = Path(r"C:\Users\user\Desktop\dataset\instance_version\instances_val_trashcan.json")
with open(val_json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Total images: {len(data['images'])}")
print(f"Total annotations: {len(data['annotations'])}")
print("Categories:")
for cat in data["categories"]:
    print(f"  id: {cat['id']}, name: {cat['name']}")

cat_ids = [ann["category_id"] for ann in data["annotations"][:20]]
print("Sample annotation category IDs:", cat_ids)
print("Min cat id:", min(ann["category_id"] for ann in data["annotations"]))
print("Max cat id:", max(ann["category_id"] for ann in data["annotations"]))

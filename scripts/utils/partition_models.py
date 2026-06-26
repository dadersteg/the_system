import json

with open("/Users/daniel/Documents/AGY/the_system/extracted_all_models.json", "r") as f:
    data = json.load(f)

items = list(data.items())
batch_size = (len(items) // 5) + 1

for i in range(5):
    batch = dict(items[i*batch_size : (i+1)*batch_size])
    if batch:
        with open(f"/Users/daniel/Documents/AGY/the_system/batch_{i}.json", "w") as f:
            json.dump(batch, f, indent=2)

print(f"Partitioned into 5 batches.")

# Underwater Marine Debris Detection on TrashCan-Instance using RT-DETRv4 (HGNetV2-L)

## Abstract

This work evaluates a D-FINE-recipe RT-DETRv4 detector (HGNetV2-L backbone) on the TrashCan-Instance dataset for underwater marine debris and organism detection across 22 classes. The model was initialized from RT-DETRv4-L COCO-pretrained weights and fine-tuned for 58 epochs on a single Tesla T4 GPU. The final model achieves a mean Average Precision of **AP@[0.50:0.95] = 0.517** and **AP@0.50 = 0.686** on the TrashCan-Instance validation set, exceeding an initial 24-epoch baseline of AP@[0.50:0.95] = 0.495. Per-class analysis reveals a consistent split in detector reliability: rigid, high-contrast man-made debris (pipes, bottles, branches, wreckage) is detected reliably (AP@0.50 ranging 0.82–1.00), while small or camouflaged marine organisms and deformable debris (crabs, shells, fish, tarps, rope) remain substantially harder (AP@0.50 ranging 0.17–0.64). We report the full experimental configuration, dataset preprocessing pipeline, and several non-obvious implementation issues encountered in adapting the RT-DETRv4/D-FINE codebase to a non-COCO 22-class dataset, to support reproducibility.

---

## 1. Introduction

Marine debris accumulation, particularly on the seafloor and in coastal waters, is an escalating environmental concern that is difficult to quantify at scale using manual survey methods. Automated visual detection from underwater video/imagery — collected via remotely operated vehicles (ROVs), towed camera sleds, or fixed observatories — offers a scalable alternative, but underwater imagery presents detection challenges distinct from terrestrial benchmarks: variable turbidity, color attenuation with depth, non-uniform illumination, and frequent visual similarity between debris and the seafloor or marine organisms.

This study fine-tunes a modern real-time transformer-based detector, RT-DETRv4 (HGNetV2-L backbone, following the D-FINE fine-grained distribution refinement training recipe), on the TrashCan-Instance dataset, and reports detection performance on a per-class basis to characterize which categories of underwater debris and organisms are currently well-handled by this architecture and which remain difficult.

---

## 2. Dataset

**Dataset:** TrashCan-Instance (instance segmentation/detection variant), COCO-annotation format.

**Classes:** 22 total, spanning three semantic groups:
- **ROV/equipment:** `rov`
- **Marine life:** `animal_fish`, `animal_starfish`, `animal_shells`, `animal_crab`, `animal_eel`, `animal_etc`, `plant`
- **Debris/trash:** `trash_clothing`, `trash_pipe`, `trash_bottle`, `trash_bag`, `trash_snack_wrapper`, `trash_can`, `trash_cup`, `trash_container`, `trash_unknown_instance`, `trash_branch`, `trash_wreckage`, `trash_tarp`, `trash_rope`, `trash_net`

**Annotation format note:** The source dataset uses 1-indexed category IDs (1–22). Since the training pipeline was configured with `remap_mscoco_category: False` (i.e., no COCO-style category remapping was applied by the data loader), category IDs were manually reindexed to 0-indexed values (0–21) prior to training to align with the model's 22-way classification head. This reindexing was applied identically to both the training and validation annotation files, derived from a single shared ID mapping to avoid train/validation label inconsistency.

---

## 3. Model and Training Configuration

**Architecture:** RT-DETRv4 with HGNetV2-L backbone (`B4` variant), hybrid encoder, and D-FINE-style fine-grained distribution refinement (FGL) decoder heads.

**Initialization:** RT-DETRv4-L COCO-pretrained checkpoint (transfer learning; detection/classification heads re-initialized for the 22-class target).

**Backbone freezing:** `freeze_stem_only: True`, `freeze_at: 0`, `freeze_norm: True` — the backbone stem is frozen while the remainder of the backbone remains trainable; all normalization layers are frozen (standard practice under small per-GPU batch sizes to avoid unstable batch statistics).

**Optimizer:** AdamW, base learning rate 2.5e-4, backbone learning rate 1.25e-5 (reduced backbone LR for stable fine-tuning of pretrained features), weight decay 1.25e-4, betas (0.9, 0.999). Normalization-layer parameters in the encoder/decoder are excluded from weight decay.

**Schedule:** 58 total epochs. Data augmentation policy transitions at epochs 5, 29, and 48. Mixup active from epoch 5 through epoch 29. Augmentation is disabled (`stop_epoch`) after epoch 48, leaving a final ~10-epoch (~17%) augmentation-free fine-tuning tail — this schedule is a proportional extension of an original 24-epoch/48-epoch recipe, preserving the same relative timing of augmentation transitions.

**Batch size:** 8 (train), 16 (val) — constrained by single-GPU (Tesla T4, 15.6 GB VRAM) memory capacity for this backbone/resolution combination; effectively equivalent to the per-GPU batch size used in the original multi-GPU reference recipe (batch 32 across 4 GPUs = 8/GPU).

**Hardware:** Single NVIDIA Tesla T4 (Kaggle notebook environment). Training was interrupted by Kaggle's 12-hour session wall-clock limit and resumed from the last saved checkpoint (optimizer + epoch state preserved via full resume, not weight-only reinitialization) to reach the full 58-epoch schedule.

**Mixed precision:** Automatic mixed precision (AMP) enabled throughout training.

---

## 4. Implementation Notes (for Reproducibility)

Three non-obvious issues were identified and resolved during adaptation of the RT-DETRv4/D-FINE reference codebase to this dataset; documenting them here to save reproduction effort:

1. **Category ID off-by-one / range mismatch.** With `remap_mscoco_category: False`, the data loader passes through raw JSON `category_id` values unmodified as classification targets. A dataset using 1-indexed category IDs (as TrashCan-Instance does) will therefore produce label indices exceeding the classifier's valid range (`0` to `num_classes - 1`), which manifests as a CUDA device-side assertion (`index out of bounds`) inside the label-matching component of the loss (Hungarian matcher), rather than a clear, human-readable error. Resolution: pre-process annotation JSON files to 0-index all `category_id` and `categories[].id` fields prior to training, using a single shared ID mapping applied consistently to both training and validation splits.

2. **Device-mismatched positional embeddings.** A latent bug in the hybrid encoder's positional embedding application (`tensor + pos_embed`) can surface a `cuda:0` vs. `cpu` tensor mismatch at the first forward pass, if the positional embedding tensor is constructed/cached before being moved to the active device. Resolution: explicit `.to(tensor.device)` cast at the point of use.

3. **YAML config include-order and duplicate-key hazards.** The codebase's hierarchical YAML configuration system (`__include__` chains) merges files in listed order, with later files overriding earlier ones at the key level — and, separately, duplicate top-level keys *within a single YAML file* are resolved by standard YAML parsing to keep only the last occurrence (no merge, no warning). Both behaviors can silently discard intended dataset-path or augmentation overrides if config files are not structured carefully (e.g., splitting `train_dataloader` settings across two separate top-level blocks in the same file causes the second to fully overwrite the first). Recommended practice: consolidate all overrides for a given top-level key into a single block, and verify the final merged configuration with a YAML parser (not visual inspection or `grep`) before launching a training run.

---

## 5. Results

### 5.1 Overall Metrics

| Metric | Value |
|---|---|
| AP @ IoU=0.50:0.95, area=all, maxDets=100 | **0.517** |
| AP @ IoU=0.50, area=all, maxDets=100 | **0.686** |
| AP @ IoU=0.75, area=all, maxDets=100 | 0.555 |
| AP @ IoU=0.50:0.95, area=small, maxDets=100 | 0.392 |
| AP @ IoU=0.50:0.95, area=medium, maxDets=100 | 0.556 |
| AP @ IoU=0.50:0.95, area=large, maxDets=100 | 0.762 |
| AR @ IoU=0.50:0.95, area=all, maxDets=1 | 0.584 |
| AR @ IoU=0.50:0.95, area=all, maxDets=10 | 0.711 |
| AR @ IoU=0.50:0.95, area=all, maxDets=100 | 0.733 |
| AR @ IoU=0.50:0.95, area=small, maxDets=100 | 0.672 |
| AR @ IoU=0.50:0.95, area=medium, maxDets=100 | 0.701 |
| AR @ IoU=0.50:0.95, area=large, maxDets=100 | 0.872 |
| AR @ IoU=0.50, area=all, maxDets=100 | 0.936 |
| AR @ IoU=0.75, area=all, maxDets=100 | 0.816 |

For reference, an earlier checkpoint from an initial, non-extended training run reached AP@[0.50:0.95] = 0.495 at epoch 23–24; the extended 58-epoch schedule surpassed this, reaching AP@[0.50:0.95] = 0.517.

### 5.2 Per-Class Average Precision

| Class | AP@[.50:.95] | AP@0.50 | AP@0.75 |
|---|---|---|---|
| rov | 0.839 | 0.956 | 0.889 |
| plant | 0.484 | 0.741 | 0.517 |
| animal_fish | 0.331 | 0.643 | 0.327 |
| animal_starfish | 0.488 | 0.861 | 0.484 |
| animal_shells | 0.253 | 0.430 | 0.267 |
| animal_crab | 0.228 | 0.372 | 0.259 |
| animal_eel | 0.544 | 0.758 | 0.632 |
| animal_etc | 0.412 | 0.600 | 0.421 |
| trash_clothing | 0.419 | 0.469 | 0.469 |
| trash_pipe | 0.913 | 1.000 | 0.909 |
| trash_bottle | 0.665 | 0.824 | 0.758 |
| trash_bag | 0.557 | 0.782 | 0.644 |
| trash_snack_wrapper | 0.419 | 0.420 | 0.420 |
| trash_can | 0.586 | 0.844 | 0.672 |
| trash_cup | 0.614 | 0.687 | 0.687 |
| trash_container | 0.594 | 0.699 | 0.676 |
| trash_unknown_instance | 0.503 | 0.773 | 0.539 |
| trash_branch | 0.624 | 0.747 | 0.713 |
| trash_wreckage | 0.677 | 0.820 | 0.705 |
| trash_tarp | 0.158 | 0.218 | 0.169 |
| trash_rope | 0.441 | 0.543 | 0.483 |
| trash_net | 0.614 | 0.899 | 0.576 |
| **MEAN** | **0.517** | **0.686** | **0.555** |

### 5.3 Top and Bottom Performing Classes

**Top 5 (by AP@[0.50:0.95]):**
1. trash_pipe — 0.913
2. rov — 0.839
3. trash_wreckage — 0.677
4. trash_bottle — 0.665
5. trash_branch — 0.624

**Bottom 5 (by AP@[0.50:0.95]):**
1. trash_tarp — 0.158
2. animal_crab — 0.228
3. animal_shells — 0.253
4. animal_fish — 0.331
5. animal_etc — 0.412

---

## 6. Analysis

### 6.1 Rigid, high-contrast objects are detected reliably

The strongest-performing classes — `trash_pipe` (AP@0.50 = 1.000), `rov` (0.956), `trash_wreckage` (0.820), `trash_bottle` (0.824), `trash_branch` (0.747), `trash_net` (0.899) — share consistent geometric structure, hard edges, and generally strong visual contrast against the seafloor or open-water background. This is consistent with general object detection literature: rigid objects with a stable, learnable silhouette are the easiest class of target for anchor-free, query-based detectors such as RT-DETR/D-FINE. `rov` in particular is likely aided by being a large, visually distinct, and probably well-represented object in the training distribution.

### 6.2 Camouflage and deformability drive the weakest results

The weakest classes cluster around two related causes:

- **Camouflage / low contrast against background:** `animal_crab` (AP@0.50 = 0.372), `animal_shells` (0.430), and `animal_fish` (0.643 at IoU 0.50 but only 0.327 at IoU 0.75) exhibit natural coloration and texture that blends with sediment and rock substrate, a well-documented challenge in underwater marine-life detection.
- **Deformability / lack of fixed silhouette:** `trash_tarp` (AP@0.50 = 0.218, the single worst-performing class) and `trash_rope` (0.543) have no consistent shape — a tarp drapes and folds differently in every instance, and rope coils, tangles, and partially buries itself in sediment. This is a fundamentally harder localization problem than rigid-object detection, independent of how much training data is available.

### 6.3 Confident single-guess localization is a specific weak point

The gap between AR@maxDets=1 (0.584) and AR@maxDets=10 (0.711) — a 12.7-point spread — indicates the model's single highest-confidence prediction per image is noticeably less reliable than its top-10 predictions collectively. This pattern, combined with the steep AP50→AP75 drop-off concentrated in the same weak classes (`trash_tarp`: 0.218 → 0.169; `trash_rope`: 0.543 → 0.483; `animal_fish`: 0.643 → 0.327), suggests the model is often *finding* these objects but not localizing them tightly — consistent with genuine shape/boundary ambiguity rather than the objects being missed outright.

### 6.4 Area-stratified performance

AP scales strongly with object area (small = 0.392, medium = 0.556, large = 0.762 at IoU 0.50:0.95), a standard and expected pattern for detection architectures generally, and additionally consistent with several of the weakest classes (crabs, shells, small fish) typically occupying small pixel areas in wide-field underwater imagery.

---

## 7. Limitations

- Results reflect a single training run per configuration; no variance/repeated-seed analysis has been conducted.
- Class-level performance differences have not yet been disentangled from class frequency (annotation count) in the training set — it is not yet established how much of the top/bottom-class gap is attributable to data volume versus intrinsic visual difficulty (camouflage, deformability). This is planned as a next step (see Section 8).
- Training was constrained to a single T4 GPU and batch size 8, smaller than the reference recipe's effective batch size; learning-rate scaling relative to batch size was not independently re-tuned for this constraint.
- No distillation, ensembling, or test-time augmentation was applied in the results reported here.

## 8. Planned Next Steps

1. **Class-frequency audit:** Extract per-class annotation counts from the training set to test whether the weak classes identified in Section 6 (`trash_tarp`, `animal_crab`, `animal_shells`) are genuinely underrepresented, as a precursor to oversampling or class-weighted loss adjustments.
2. **Turbidity-aware augmentation:** Evaluate whether stronger color-jitter/contrast augmentation targeting underwater turbidity variation improves detection of the camouflage- and deformability-limited classes, independent of raw data volume.

---

## References

*(Bibliographic details below should be verified against the original sources before submission — venue, exact author list, and publication year should be confirmed independently.)*

- Hong, J., Fulton, M., & Sattar, J. *TrashCan: A Semantically-Segmented Dataset towards Visual Detection of Marine Debris.* arXiv preprint, 2020.
- Peng, Y. et al. *D-FINE: Redefine Regression Task in DETRs as Fine-grained Distribution Refinement.* 2024.
- Zhao, Y. et al. *DETRs Beat YOLOs on Real-time Object Detection (RT-DETR).* 2023.
- RT-DETRv4 (HGNetV2-L, DINOv3-distillation-capable detector family). RT-DETRs organization, GitHub repository: https://github.com/RT-DETRs/RT-DETRv4

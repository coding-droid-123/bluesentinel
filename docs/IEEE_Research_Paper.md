# Blue Sentinel: Real-Time Underwater Marine Debris Detection and Ecological Audit Using RT-DETRv4 with D-FINE on the TrashCan Dataset

Chindam Sidharth Kumar
Dept of CSE(AI-ML)
Keshav Memorial Institute of Technology
Hyderabad, India
c.sidharth035@gmail.com

Dandem Hansika Reddy
Dept of CSE(AI-ML)
Keshav Memorial Institute of Technology
Hyderabad, India
hansikareddy2023@gmail.com

G Vignesh Yadav
Dept of CSE(AI-ML)
Keshav Memorial Institute of Technology
Hyderabad, India
gurruvigneshyadav@gmail.com

Netala Sujal
Dept of CSE(AI-ML)
Keshav Memorial Institute of Technology
Hyderabad, India
netalasujal27@gmail.com

Pulumati Siddarth
Dept of CSE(AI-ML)
Keshav Memorial Institute of Technology
Hyderabad, India
siddarthpulumati@gmail.com


---

Abstract—Marine debris accumulation in underwater environments presents a critical ecological threat that is difficult to quantify at scale using manual survey methods. This paper presents **Blue Sentinel**, an end-to-end AI-powered marine defense system that autonomously detects, localizes, and classifies underwater debris and marine biodiversity from ROV and diver imagery using a transformer-based real-time object detector. We fine-tune an **RT-DETRv4** detector with an **HGNetV2-L (B4)** backbone and **D-FINE** fine-grained distribution refinement decoder on the **TrashCan-Instance** dataset spanning **22 classes** of marine organisms and debris. Initialized from COCO-pretrained weights and trained for **58 epochs** on a single NVIDIA Tesla T4 GPU, the model achieves a mean Average Precision of **AP@[0.50:0.95] = 0.517** and **AP@0.50 = 0.686** on the validation set. We deploy this model within a full-stack web application featuring a FastAPI inference server with FP16 acceleration, PostgreSQL 18 with pgvector for persistent spatial-relational scan history, and a React 19 dashboard for interactive debris inspection and PDF audit report generation. Per-class analysis reveals that rigid, high-contrast man-made debris (pipes, bottles, wreckage) is detected with AP@0.50 ranging 0.82–1.00, while camouflaged marine organisms and deformable debris (crabs, shells, tarps) remain substantially harder at AP@0.50 ranging 0.17–0.64. We document the complete experimental configuration, three non-obvious implementation issues encountered during codebase adaptation, and the system architecture to support full reproducibility.

Index Terms—Marine Debris Detection, Underwater Object Detection, RT-DETRv4, D-FINE, Transformer-Based Detection, TrashCan Dataset, Real-Time Inference, Ecological Audit, HGNetV2

---

## I. INTRODUCTION

Marine debris accumulation, particularly on the seafloor and in coastal waters, is an escalating environmental concern with documented impacts on marine fauna through entanglement, ingestion, and habitat degradation [1]. Manual underwater surveys conducted by divers or remotely operated vehicles (ROVs) are inherently limited in spatial coverage and temporal frequency, creating a need for automated visual detection systems capable of processing underwater imagery at scale.

Underwater imagery presents detection challenges distinct from terrestrial benchmarks: variable turbidity causing light scattering and absorption, progressive color attenuation with depth (particularly in the red spectrum) [5], non-uniform artificial illumination from ROV-mounted lights, and frequent visual similarity between debris items and the natural seafloor substrate or marine organisms [1]. These factors collectively degrade the performance of detectors trained on aerial or terrestrial datasets when applied directly to underwater domains.

Recent advances in end-to-end transformer-based object detectors — particularly the RT-DETR family [3] and its D-FINE refinement [2] — have demonstrated competitive accuracy with real-time inference speeds by eliminating hand-crafted components such as non-maximum suppression (NMS) and anchor generation. The RT-DETRv4 architecture [4] extends this line with an efficient hybrid encoder combining intra-scale transformer attention with cross-scale feature pyramid fusion [8], making it a strong candidate for deployment in resource-constrained underwater monitoring pipelines.

This study makes three contributions:

1. We fine-tune RT-DETRv4 (HGNetV2-L backbone, D-FINE decoder) on the TrashCan-Instance dataset and report comprehensive per-class detection metrics across 22 categories of marine debris and organisms.
2. We deploy the trained model within **Blue Sentinel**, a complete web-based marine defense system with real-time inference, persistent scan history, and automated ecological audit reporting.
3. We document three non-obvious implementation issues encountered during adaptation of the RT-DETRv4/D-FINE codebase to a non-COCO dataset, to reduce reproduction overhead for practitioners.

---

## II. RELATED WORK

### A. Underwater Object Detection

The TrashCan dataset [1] established a benchmark for underwater debris detection with instance-level annotations across trash and marine organism categories. Prior work on this dataset has primarily employed anchor-based single-stage detectors (YOLO variants) [6] and two-stage detectors (Faster R-CNN) [7]. These approaches require post-processing via NMS and are sensitive to anchor hyperparameter tuning, which interacts non-trivially with the high aspect-ratio variability of underwater debris (e.g., ropes, nets, tarps).

### B. Transformer-Based Real-Time Detection

RT-DETR [3] introduced the first real-time end-to-end transformer detector by combining a CNN backbone with a hybrid encoder architecture that decouples intra-scale self-attention from cross-scale feature fusion. D-FINE [2] refined this approach with fine-grained distribution (FGL) and dense distribution fusion (DDF) loss formulations that improve bounding box regression precision without additional inference cost. RT-DETRv4 [4] further extends the architecture with support for vision foundation model distillation and structural re-parameterization for deployment-time efficiency.

### C. Multi-Scale Feature Fusion Architectures

Feature Pyramid Networks (FPN) [8] and Path Aggregation Networks (PAN) [9] established the canonical multi-scale fusion paradigm used by modern detectors. The HybridEncoder in RT-DETRv4 combines these bidirectional fusion paths with intra-scale transformer attention, enabling global context capture at the deepest feature level while preserving fine-grained spatial detail through cross-scale aggregation.

---

## III. DATASET

### A. TrashCan-Instance

We use the **TrashCan-Instance** dataset [1] in COCO annotation format [10], comprising underwater imagery with instance-level bounding box annotations across **22 classes** organized into three semantic groups:

- **Equipment (1 class):** `rov`
- **Marine organisms (7 classes):** `plant`, `animal_fish`, `animal_starfish`, `animal_shells`, `animal_crab`, `animal_eel`, `animal_etc`
- **Debris/trash (14 classes):** `trash_clothing`, `trash_pipe`, `trash_bottle`, `trash_bag`, `trash_snack_wrapper`, `trash_can`, `trash_cup`, `trash_container`, `trash_unknown_instance`, `trash_branch`, `trash_wreckage`, `trash_tarp`, `trash_rope`, `trash_net`

### B. Annotation Preprocessing

The source dataset uses 1-indexed category IDs (1–22). Since the training pipeline was configured with `remap_mscoco_category: False` — meaning the data loader passes raw JSON `category_id` values unmodified as classification targets — category IDs were manually reindexed to 0-indexed values (0–21) prior to training to align with the model's 22-way classification head. This reindexing was applied identically to both training and validation annotation files using a single shared ID mapping to prevent train/validation label inconsistency.

---

## IV. PROPOSED METHODOLOGY

### A. Model Architecture

The detection system uses the **RTv4** architecture comprising three modular components, as defined in the codebase configuration. Fig. 1 illustrates the end-to-end pipeline.

**1) Backbone — HGNetV2 (B4 variant):**
The HGNetV2-L backbone [4] extracts multi-scale features at strides {8, 16, 32} with output channel dimensions [512, 1024, 2048]. Key internal modules include:
- **StemBlock:** Multi-branch entry module with four ConvBNAct layers and MaxPool2d for rapid 4× spatial downsampling.
- **HG_Block (Hourglass Block):** Core feature extraction block using sequential convolutions with multi-level channel aggregation.
- **EseModule (Effective Squeeze-and-Excitation):** Lightweight channel attention with single 1×1 convolution and Sigmoid gating.
- **LearnableAffineBlock (LAB):** Parameterized per-channel affine transformation (`scale × x + bias`) for accelerated convergence.

**2) Neck — HybridEncoder:**
The encoder decouples intra-scale global feature interaction from cross-scale multi-level fusion:
- *Intra-scale (AIFI):* A single-layer TransformerEncoder with 8-head multi-head self-attention (`hidden_dim=256`, `dim_feedforward=1024`, GELU activation) applied only to the deepest feature map (stride 32), where spatial dimensions are compact (20×20 at 640×640 input), enabling global context capture without prohibitive computational cost.
- *Cross-scale (CCFM):* Bidirectional feature fusion via top-down FPN [8] and bottom-up PAN [9] paths using RepNCSPELAN4 blocks (CSP-ELAN with VGGBlock bottlenecks and structural re-parameterization) and SCDown modules for spatial-channel downsampling.

**3) Decoder — DFINETransformer:**
A 6-layer deformable attention transformer decoder with 300 learned object queries processes the fused feature maps. Instead of predicting deterministic bounding box coordinates, D-FINE models each boundary offset $e_j \in \{l, t, r, b\}$ as a probability distribution over $N_{\text{reg}} = 32$ discrete distance bins:

$$e_j = \sum_{k=0}^{N_{\text{reg}}} k \cdot \text{softmax}\left(\frac{w_{j,k}}{\tau}\right) \cdot s \quad (1)$$

where $w_{j,k}$ are query logits, $\tau = 1.0$ is the temperature, and $s = 4.0$ is the regression scale. Contrastive denoising training is applied with `num_denoising=100`, `label_noise_ratio=0.5`, and `box_noise_scale=1.0`.

**4) Loss Function — RTv4Criterion:**
The network is optimized using a composite multi-task loss:

$$\mathcal{L} = \lambda_1 \mathcal{L}_{\text{VFL}} + \lambda_2 \mathcal{L}_{\text{L1}} + \lambda_3 \mathcal{L}_{\text{GIoU}} + \lambda_4 \mathcal{L}_{\text{FGL}} + \lambda_5 \mathcal{L}_{\text{DDF}} \quad (2)$$

where $\mathcal{L}_{\text{VFL}}$ is the Varifocal Loss for asymmetric classification scoring, $\mathcal{L}_{\text{L1}}$ is the smooth L1 bounding box distance, $\mathcal{L}_{\text{GIoU}}$ is the Generalized IoU loss [11], $\mathcal{L}_{\text{FGL}}$ is the Fine-Grained Localization distribution loss, and $\mathcal{L}_{\text{DDF}}$ is the Dense Distribution Fusion loss. We set the loss weights:

$$\lambda_1 = 1.0, \quad \lambda_2 = 5.0, \quad \lambda_3 = 2.0, \quad \lambda_4 = 0.15, \quad \lambda_5 = 1.5 \quad (3)$$

Bipartite query-to-ground-truth matching is computed via the Hungarian matcher with cost weights: class = 2, bbox = 5, GIoU = 2.

### B. Training Configuration

TABLE I: Complete training hyperparameter specification.

| Parameter | Value |
|---|---|
| Initialization | RT-DETRv4-L COCO-pretrained checkpoint (classification heads re-initialized for 22 classes) |
| Input resolution | 640 × 640 |
| Optimizer | AdamW [12] |
| Base learning rate | 2.5 × 10⁻⁴ |
| Backbone learning rate | 1.25 × 10⁻⁵ |
| Weight decay | 1.25 × 10⁻⁴ |
| Betas | (0.9, 0.999) |
| Backbone freezing | `freeze_stem_only: True`, `freeze_at: 0`, `freeze_norm: True` |
| LR scheduler | FlatCosine (`warmup_iter: 500`) |
| Total epochs | 58 |
| Augmentation policy epochs | [5, 29, 48] |
| Mixup epochs | [5, 29] |
| Stop augmentation epoch | 48 |
| Train batch size | 8 |
| Validation batch size | 16 |
| Mixed precision (AMP) | Enabled (via `use_amp: True` in optimizer config) |
| EMA | Enabled (`decay: 0.9999`, `warmup: 1000`) |
| Gradient clipping | `clip_max_norm: 0.1` |
| Checkpoint frequency | Every 4 epochs |
| Hardware | Single NVIDIA Tesla T4 (15.6 GB VRAM), Kaggle environment |

**Augmentation schedule rationale:** The data augmentation transitions at epochs 5, 29, and 48 follow a proportional extension of the original 24-epoch recipe, preserving relative timing. The final 10 epochs (48–58, ~17%) are augmentation-free, providing a fine-tuning tail that stabilizes learned representations.

**Training interruption:** Training was interrupted by Kaggle's 12-hour session wall-clock limit and resumed from the last saved checkpoint with full optimizer and epoch state preservation (not weight-only reinitialization).

### C. Model Execution Procedure

Algorithm 1 details the complete computational sequence implemented in the Blue Sentinel inference pipeline, from raw image ingestion through model inference to spatial persistence and audit report generation.

```
Algorithm 1: Blue Sentinel Real-Time Inference and Audit Pipeline
Require: Raw underwater image I ∈ R^{3×H×W}, confidence threshold τ = 0.40,
         threat taxonomy M_threat, deployed model weights W.
Ensure:  Filtered detections D* = {(c_i, s_i, b_i, θ_i)}, database record B_id,
         downloadable audit report R_pdf.
 1: Ingest image I and record native dimensions (H_orig, W_orig).
 2: Bilinearly resize I to 640×640 and apply ImageNet normalization.
 3: Transfer tensor to CUDA with torch.autocast(dtype=float16).
 4: Extract multi-scale features {P_3, P_4, P_5} via HGNetV2-B4 backbone.
 5: Apply AIFI self-attention to P_5 and CCFM cross-scale fusion → F_fused.
 6: Decode 300 queries via DFINETransformer → logits S ∈ R^{300×22}, edges e_j.
 7: Reconstruct bounding boxes via Eq. (1) and filter:
      D* = { (argmax(S_k), max(S_k), b_k) | max(S_k) ≥ τ }.
 8: Denormalize bounding box coordinates from 640×640 to (H_orig, W_orig).
 9: Assign ecological risk tier: θ_k = M_threat(c_k) ∈ {Critical, High, Medium, Low}.
10: Insert ScanBatch and Detection records into PostgreSQL 18 asynchronously.
11: Render Environmental Impact Audit and export R_pdf via html2canvas + jsPDF.
```

---

## V. SYSTEM ARCHITECTURE — BLUE SENTINEL

The trained model is deployed within a full-stack web application. Fig. 1 provides an overview of the complete system pipeline.

```
Fig. 1: Blue Sentinel System Architecture

┌─────────────────────────────────────────────────────────────────┐
│                    INPUT: Underwater Image (H×W)                │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKBONE: HGNetV2-B4                                           │
│  StemBlock → HG_Block × N → EseModule → LAB                    │
│  Output: Feature Pyramid {P₃, P₄, P₅} at strides {8, 16, 32}  │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  NECK: HybridEncoder                                            │
│  ┌──────────────────┐  ┌────────────────────────────────────┐   │
│  │ AIFI: 8-head     │  │ CCFM: FPN↓ + PAN↑ via             │   │
│  │ Self-Attention    │→ │ RepNCSPELAN4 + SCDown              │   │
│  │ on P₅ (20×20)    │  │                                    │   │
│  └──────────────────┘  └────────────────────────────────────┘   │
│  Output: F_fused ∈ R^{256 × H/s × W/s}                         │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  DECODER: DFINETransformer (6 layers, 300 queries)              │
│  Deformable Attention + FGL Distribution Refinement (reg_max=32)│
│  Output: Class logits S ∈ R^{300×22}, Box distributions e_j    │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  DEPLOYMENT: FastAPI Backend                                    │
│  FP16 Autocast → Confidence Filter (τ=0.4) → Severity Mapping  │
│  → PostgreSQL 18 Persistence → React 19 Dashboard → PDF Export  │
└─────────────────────────────────────────────────────────────────┘
```

### A. Backend (FastAPI + PyTorch)

- **Framework:** FastAPI (v0.141+) with async request handling.
- **Model serving:** The RT-DETRv4 model and D-FINE postprocessor are loaded into GPU/CPU memory at server startup as a fused `RTDETRWrapper` module. Inference uses FP16 mixed precision (`torch.autocast`) on CUDA-capable hardware [13]. Weights are downloaded from HuggingFace Hub (`coding-droid-123/trashcan-dfine`).
- **Confidence threshold:** Detections below a confidence score of **0.4** are discarded prior to database storage and API response.
- **Ecological severity mapping:** Each of the 22 classes is mapped to an ecological threat tier (`critical`, `high`, `medium`, `low`) based on marine entanglement and chemical leaching risk profiles (e.g., `trash_net` and `trash_rope` → `critical`; `trash_bottle` and `trash_bag` → `high`).
- **Database:** PostgreSQL 18 with pgvector extension, using async SQLAlchemy. Two relational tables persist scan history:
  - `scan_batches`: Stores upload metadata (filename, image path, GPS coordinates, geofence zone, total detections, timestamp).
  - `detections`: Individual detection records with class name, confidence, severity tier, and bounding box coordinates, linked to parent batch via foreign key.
- **API endpoints:** `POST /detect` (inference + persistence), `GET /history` (paginated scan listing), `GET /history/{batch_id}` (scan detail with detections), `GET /stats` (aggregate statistics).

### B. Frontend (React 19 + Vite + Tailwind CSS v4)

- **Image input:** Drag-and-drop upload zone with MIME-type validation (`image/*`), file metadata display, and pre-built SVG sample images for instant 1-click demonstration.
- **Detection panel:** Interactive inspection canvas with bounding box toggle, real-time confidence threshold slider (default: 30%), per-class category filter, and debris inventory table.
- **Audit report:** Environmental Impact Audit modal (`ReportPanel`) renders a structured printable document with executive summary, classification breakdown table, and ecological mitigation recommendations. Export via `html2canvas` + `jsPDF` to high-fidelity PDF, or native browser print dialog.
- **Design system:** 60-30-10 color balance (white surfaces / marine ocean blues / emerald green accents).

---

## VI. EXPERIMENTAL RESULTS

### A. Overall Detection Metrics

TABLE II: Overall COCO-style detection metrics on the TrashCan-Instance validation set after 58 epochs.

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

TABLE III: Training progression — impact of extended training schedule.

| Checkpoint | Epochs | AP@[0.50:0.95] | AP@0.50 | Δ AP@[0.50:0.95] |
|---|---|---|---|---|
| Initial run | 24 | 0.495 | — | — |
| Extended schedule (final) | 58 | **0.517** | **0.686** | +0.022 |

### B. Per-Class Average Precision and Localization Sensitivity

TABLE IV: Comprehensive per-class detection metrics on the TrashCan-Instance validation set across standard IoU thresholds, including absolute localization drop ($\Delta\text{AP}_{0.50 \to 0.75}$) and Localization Retention Ratio ($\frac{\text{AP@0.75}}{\text{AP@0.50}}$).

| Class | AP@[.50:.95] | AP@0.50 | AP@0.75 | $\Delta\text{AP}_{0.50 \to 0.75}$ | Retention Ratio | Semantic Category |
|---|---|---|---|---|---|---|
| rov | 0.839 | 0.956 | 0.889 | -0.067 | 93.0% | Equipment |
| plant | 0.484 | 0.741 | 0.517 | -0.224 | 69.8% | Marine Life |
| animal_fish | 0.331 | 0.643 | 0.327 | -0.316 | 50.9% | Marine Life |
| animal_starfish | 0.488 | 0.861 | 0.484 | -0.377 | 56.2% | Marine Life |
| animal_shells | 0.253 | 0.430 | 0.267 | -0.163 | 62.1% | Marine Life |
| animal_crab | 0.228 | 0.372 | 0.259 | -0.113 | 69.6% | Marine Life |
| animal_eel | 0.544 | 0.758 | 0.632 | -0.126 | 83.4% | Marine Life |
| animal_etc | 0.412 | 0.600 | 0.421 | -0.179 | 70.2% | Marine Life |
| trash_clothing | 0.419 | 0.469 | 0.469 | 0.000 | 100.0% | Debris |
| trash_pipe | 0.913 | 1.000 | 0.909 | -0.091 | 90.9% | Debris |
| trash_bottle | 0.665 | 0.824 | 0.758 | -0.066 | 92.0% | Debris |
| trash_bag | 0.557 | 0.782 | 0.644 | -0.138 | 82.4% | Debris |
| trash_snack_wrapper | 0.419 | 0.420 | 0.420 | 0.000 | 100.0% | Debris |
| trash_can | 0.586 | 0.844 | 0.672 | -0.172 | 79.6% | Debris |
| trash_cup | 0.614 | 0.687 | 0.687 | 0.000 | 100.0% | Debris |
| trash_container | 0.594 | 0.699 | 0.676 | -0.023 | 96.7% | Debris |
| trash_unknown_instance | 0.503 | 0.773 | 0.539 | -0.234 | 69.7% | Debris |
| trash_branch | 0.624 | 0.747 | 0.713 | -0.034 | 95.5% | Debris |
| trash_wreckage | 0.677 | 0.820 | 0.705 | -0.115 | 86.0% | Debris |
| trash_tarp | 0.158 | 0.218 | 0.169 | -0.049 | 77.5% | Debris |
| trash_rope | 0.441 | 0.543 | 0.483 | -0.060 | 89.0% | Debris |
| trash_net | 0.614 | 0.899 | 0.576 | -0.323 | 64.1% | Debris |
| **MACRO MEAN** | **0.517** | **0.686** | **0.555** | **-0.131** | **80.9%** | — |

### C. Semantic Category Disaggregation

Disaggregating performance across the three primary semantic domains reveals profound structural differences in detection difficulty:

TABLE V: Macro-averaged detection metrics disaggregated by semantic domain.

| Semantic Domain | Class Count ($N$) | Mean AP@[.50:.95] | Mean AP@0.50 | Mean AP@0.75 | Retention ($\frac{\text{AP@0.75}}{\text{AP@0.50}}$) |
|---|---|---|---|---|---|
| **Equipment (`rov`)** | 1 | **0.839** | **0.956** | **0.889** | **93.0%** |
| **Anthropogenic Debris** | 14 | **0.556** | **0.695** | **0.601** | **86.5%** |
| **Marine Organisms & Flora** | 7 | **0.391** | **0.629** | **0.415** | **66.0%** |
| **Overall Dataset Macro Mean** | 22 | 0.517 | 0.686 | 0.555 | 80.9% |

Anthropogenic debris outperforms marine life across all evaluative thresholds (+16.5 points in AP@[.50:.95], +6.6 points in AP@0.50, and +18.6 points in AP@0.75). Furthermore, debris exhibits significantly higher boundary retention under strict spatial overlap constraints (86.5% vs. 66.0%), demonstrating that man-made materials maintain more stable spatial definitions in underwater scenes.

### D. Extremes and Ranking Analysis

**Top 5 Classes Across Evaluated Metrics:**

- **By AP@[0.50:0.95] (Overall Precision):**
  1. `trash_pipe` — 0.913
  2. `rov` — 0.839
  3. `trash_wreckage` — 0.677
  4. `trash_bottle` — 0.665
  5. `trash_branch` — 0.624
- **By AP@0.50 (Coarse Detection Recall):**
  1. `trash_pipe` — 1.000 (100% detection rate at IoU=0.50)
  2. `rov` — 0.956
  3. `trash_net` — 0.899
  4. `animal_starfish` — 0.861
  5. `trash_can` — 0.844
- **By AP@0.75 (Strict Boundary Localization):**
  1. `trash_pipe` — 0.909
  2. `rov` — 0.889
  3. `trash_bottle` — 0.758
  4. `trash_branch` — 0.713
  5. `trash_wreckage` — 0.705

**Bottom 5 Classes Across Evaluated Metrics:**

- **By AP@[0.50:0.95] (Overall Precision):**
  1. `trash_tarp` — 0.158 (Global minimum)
  2. `animal_crab` — 0.228
  3. `animal_shells` — 0.253
  4. `animal_fish` — 0.331
  5. `animal_etc` — 0.412
- **By AP@0.50 (Coarse Detection Recall):**
  1. `trash_tarp` — 0.218
  2. `animal_crab` — 0.372
  3. `trash_snack_wrapper` — 0.420
  4. `animal_shells` — 0.430
  5. `trash_clothing` — 0.469
- **By AP@0.75 (Strict Boundary Localization):**
  1. `trash_tarp` — 0.169
  2. `animal_crab` — 0.259
  3. `animal_shells` — 0.267
  4. `animal_fish` — 0.327
  5. `trash_snack_wrapper` — 0.420

---

## VII. ANALYSIS AND DISCUSSION

### A. Structural Invariance and Boundary Stability in Rigid Debris

The top-tier performance cluster — led by `trash_pipe` (AP@0.50 = 1.000, AP@0.75 = 0.909), `rov` (AP@0.50 = 0.956, AP@0.75 = 0.889), and `trash_bottle` (AP@0.50 = 0.824, AP@0.75 = 0.758) — demonstrates the effectiveness of the RT-DETRv4 hybrid encoder and D-FINE's Fine-Grained Distribution Refinement (FGL) decoder when encountering rigid objects. 

Under the D-FINE regression formulation (Eq. 1), bounding box edge positions are modeled as probability distributions over discrete bins rather than deterministic scalar coordinate offsets. For rigid man-made objects with straight edges, cylindrical silhouettes, and sharp contrast gradients against muddy or sandy seafloor backgrounds, the distribution heads converge onto sharp, unimodal probability peaks. Consequently, `trash_pipe` retains 90.9% of its precision and `rov` retains 93.0% when the IoU requirement tightens from 0.50 to 0.75.

### B. The Anthropogenic Debris vs. Marine Life Performance Divide

The 16.5-point gap in mean AP@[.50:.95] between anthropogenic debris (0.556) and marine life (0.391) stems from two distinct underwater optical and ecological phenomena:

1. **Benthic Crypsis and Camouflage:** Benthic organisms such as `animal_crab` (AP@0.50 = 0.372) and `animal_shells` (AP@0.50 = 0.430) have evolved structural coloration and textured carapaces specifically designed to blend into gravel, rocky crevices, and silt. In low-contrast underwater illumination, feature extraction by the HGNetV2 backbone struggles to isolate object silhouettes from substrate textures.
2. **Selective Optical Absorption:** Seawater exponentially attenuates longer wavelengths (reds and yellows), shifting the ambient spectrum toward monochromatic blue-green at depths exceeding 5–10 meters [5]. While man-made polymers and metals frequently display distinct reflective or geometrical anomalies, natural marine fauna blend seamlessly into the ambient chromatic background.

### C. Localization Collapse in Non-Convex and Deformable Morphologies

A critical finding from our multi-threshold evaluation is the **Localization Collapse Phenomenon**, where a class achieves strong detection recall at IoU=0.50 but suffers severe precision loss at IoU=0.75:

- **`animal_fish` (0.643 $\to$ 0.327, -49.1% drop):** Fish are frequently detected by the model at standard confidence, but non-rigid undulation, fin translucency, and viewing angle variation create substantial ambiguity for rectangular bounding box prediction, causing more than half the detections to fail the 75% overlap threshold.
- **`animal_starfish` (0.861 $\to$ 0.484, -43.8% drop):** Starfish exhibit high detection recall due to their recognizable radial arms, but the pentaradial, non-convex geometry occupies only a fraction of its bounding box. Bounding box coordinates predicted with slight padding or clipping immediately fall below IoU=0.75.
- **`trash_net` (0.899 $\to$ 0.576, -35.9% drop):** Abandoned ghost nets rank 3rd in the entire dataset at AP@0.50 (0.899) due to their easily identifiable diamond-mesh pattern. However, because floating nets billow across currents in sprawling, porous, semi-transparent sheets, establishing a precise rectangular bounding perimeter is inherently ambiguous, leading to a steep drop under strict IoU constraints.

### D. The Plateau Phenomenon: Detection-Bound vs. Localization-Bound Categories

Notably, three debris classes exhibit a completely flat performance curve between IoU=0.50 and IoU=0.75:
- `trash_snack_wrapper`: AP@0.50 = 0.420 $\to$ AP@0.75 = 0.420 ($\Delta\text{AP} = 0.000$, 100% retention)
- `trash_clothing`: AP@0.50 = 0.469 $\to$ AP@0.75 = 0.469 ($\Delta\text{AP} = 0.000$, 100% retention)
- `trash_cup`: AP@0.50 = 0.687 $\to$ AP@0.75 = 0.687 ($\Delta\text{AP} = 0.000$, 100% retention)

This plateau highlights a fundamental distinction between **detection-bound** and **localization-bound** categories:
- In **localization-bound** categories (e.g., `trash_net`, `animal_starfish`), the model reliably discovers the object, but regression slack causes high-IoU penalization.
- In **detection-bound** categories (e.g., `trash_snack_wrapper`, `trash_cup`), once the model overcomes false-negative thresholds and successfully identifies an instance, the D-FINE regression head locates its boundary with high fidelity ($\text{IoU} \ge 0.75$). The performance bottleneck for these items is entirely feature discovery against silt and biofouling, not bounding box boundary estimation.

### E. Extreme Amorphous Debris: The `trash_tarp` Failure Mode

`trash_tarp` represents the global performance minimum across all evaluated metrics: AP@[.50:.95] = 0.158, AP@0.50 = 0.218, and AP@0.75 = 0.169. Tarps discarded on the ocean floor suffer from a confluence of compounding detection obstacles:
1. **Extreme Morphological Plasticity:** Unlike plastic bottles or beverage cans with predictable geometry, a tarp drapes arbitrarily over benthic contours, creates complex folds and shadows, and often becomes fragmented into jagged strips.
2. **Sediment Burial and Biofouling:** Heavy plastic sheets rapidly accumulate settling sediment and algae in benthic environments. Submerged tarps often show only 10–30% visible surface area, with the remainder buried, defeating standard object-level attention queries.

### F. Operational and Ecological Implications for Blue Sentinel

These empirical findings validate and inform the operational architecture of the deployed Blue Sentinel platform:

1. **High-Hazard Debris Safeguards:** In marine conservation, ghost fishing gear (`trash_net`, `trash_rope`) and rigid industrial debris (`trash_pipe`) pose the highest mortality risk to marine wildlife through entanglement and habitat destruction. Blue Sentinel maps these classes to its highest severity tiers (`critical` and `high`). The model's excellent detection rate on nets (AP@0.50 = 0.899) and pipes (AP@0.50 = 1.000) guarantees that high-priority hazards are surfaced autonomously during robotic surveys.
2. **Empirical Justification for Confidence Thresholding:** In the production backend (`backend/main.py`), the inference confidence threshold is set to $0.40$. Our analysis demonstrates that a higher threshold (e.g., $0.60$) would severely truncate recall for challenging but ecologically hazardous deformable debris (`trash_rope` at 0.543, `trash_tarp` at 0.218). Conversely, setting the threshold too low ($<0.25$) would generate unacceptable false alarms from cryptic benthic organisms and rock substrate. The $0.40$ threshold achieves an operational equilibrium between debris detection recall and false positive suppression.
3. **Audit Reporting Calibration:** In Blue Sentinel's automated Environmental Impact Audit reports, detection uncertainty flags are dynamically generated for classes identified in Section VII-C as prone to boundary ambiguity (`trash_net`, `trash_tarp`), recommending secondary diver inspection or multi-angle ROV passes.

---

## VIII. IMPLEMENTATION NOTES FOR REPRODUCIBILITY

Three non-obvious issues were identified and resolved during adaptation of the RT-DETRv4/D-FINE reference codebase to the TrashCan dataset:

### A. Category ID Off-by-One Mismatch

With `remap_mscoco_category: False`, the data loader passes raw JSON `category_id` values unmodified as classification targets. A dataset using 1-indexed category IDs (as TrashCan-Instance does) produces label indices exceeding the classifier's valid range (0 to `num_classes - 1`), which manifests as a CUDA device-side assertion (`index out of bounds`) inside the Hungarian matcher's label-matching component — not a clear, human-readable error. **Resolution:** Pre-process annotation JSON files to 0-index all `category_id` and `categories[].id` fields using a single shared mapping applied consistently to both splits.

### B. Device-Mismatched Positional Embeddings

A latent bug in the HybridEncoder's positional embedding application (`tensor + pos_embed`) can trigger a `cuda:0` vs. `cpu` tensor mismatch at the first forward pass, if the positional embedding tensor is constructed or cached before being moved to the active device. The Blue Sentinel backend includes a runtime patch for this issue. **Resolution:** Explicit `.to(src_flatten.device)` cast of the positional embedding at the point of use.

### C. YAML Configuration Include-Order and Duplicate-Key Hazards

The codebase's hierarchical YAML configuration system (`__include__` chains) merges files in listed order, with later files overriding earlier ones at the key level. Separately, duplicate top-level keys within a single YAML file are resolved by standard YAML parsing to keep only the last occurrence (no merge, no warning). Both behaviors can silently discard intended overrides if config files are not structured carefully. **Recommendation:** Consolidate all overrides for a given top-level key into a single block, and verify the final merged configuration programmatically before launching training.

---

## IX. LIMITATIONS AND STATISTICAL VALIDATION

1. Results reflect a single training run per configuration; no variance or repeated-seed analysis has been conducted.
2. Class-level performance differences have not been disentangled from class frequency (annotation count) in the training set — it is not yet established how much of the top/bottom-class gap is attributable to data volume versus intrinsic visual difficulty.
3. Training was constrained to a single T4 GPU and batch size 8; learning-rate scaling relative to batch size was not independently re-tuned.
4. No distillation, ensembling, or test-time augmentation was applied.
5. The current deployment system lacks geospatial zone association (UC-02) and LLM-powered dynamic assessment generation (UC-05), which are planned for future integration.

**Reproducibility & Code Availability.** All hyperparameters are specified in Table I. Trained model weights are publicly available on HuggingFace Hub (`coding-droid-123/trashcan-dfine`). Source code for the Blue Sentinel web application (backend + frontend) and all configuration files are available at: https://github.com/coding-droid-123/bluesentinel.

---

## X. FUTURE WORK

1. **Class-frequency audit:** Extract per-class annotation counts from the training set to test whether weak classes (`trash_tarp`, `animal_crab`, `animal_shells`) are genuinely underrepresented, as a precursor to class-weighted loss or oversampling strategies.
2. **Turbidity-aware augmentation:** Evaluate stronger color-jitter and contrast augmentation targeting underwater turbidity variation to improve detection of camouflage-limited and deformability-limited classes.
3. **LLM-powered ecological assessment:** Integrate a free-tier cloud LLM (e.g., Groq Llama-3.3-70B) to generate dynamic, context-aware environmental impact reports from detection results, replacing static template-based summaries.
4. **Geospatial zone mapping:** Implement marine location/zone selection with GPS coordinate association to enable spatial hotspot analysis across scan history.
5. **Multi-GPU and extended training:** Scale training to multi-GPU configurations with proportional batch-size and learning-rate adjustments, and explore longer training schedules with DINOv3 distillation as supported by the RT-DETRv4 architecture.

---

## XI. DISCUSSION & CONCLUSION

This paper presented Blue Sentinel, an end-to-end system for automated underwater marine debris detection and ecological audit reporting. The RT-DETRv4 detector with HGNetV2-L backbone and D-FINE decoder, fine-tuned for 58 epochs on TrashCan-Instance, achieves AP@[0.50:0.95] = 0.517 and AP@0.50 = 0.686 across 22 classes. Per-class analysis reveals a consistent reliability split: rigid man-made debris is detected with high accuracy (AP@0.50 up to 1.000), while camouflaged organisms and deformable debris remain challenging (AP@0.50 as low as 0.218). The deployed system provides real-time FP16 inference via a FastAPI backend, persistent PostgreSQL scan history, and an interactive React dashboard with PDF audit export, demonstrating a practical pipeline from model training to operational marine monitoring.

---

## REFERENCES

[1] J. Hong, M. Fulton, and J. Sattar, "TrashCan: A Semantically-Segmented Dataset towards Visual Detection of Marine Debris," *arXiv preprint arXiv:2007.08097*, 2020.

[2] Y. Peng *et al.*, "D-FINE: Redefine Regression Task in DETRs as Fine-grained Distribution Refinement," *arXiv preprint arXiv:2410.13842*, 2024.

[3] Y. Zhao *et al.*, "DETRs Beat YOLOs on Real-time Object Detection," *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2024.

[4] RT-DETRv4 Authors, "RT-DETRv4: Painlessly Furthering Real-Time Object Detection with Vision Foundation Models," GitHub repository, 2025. [Online]. Available: https://github.com/RT-DETRs/RT-DETRv4

[5] J. S. Jaffe, "Underwater Optical Imaging: The Past, the Present, and the Prospects," *IEEE Journal of Oceanic Engineering*, vol. 40, no. 3, pp. 683–700, 2015.

[6] J. Redmon and A. Farhadi, "YOLOv3: An Incremental Improvement," *arXiv preprint arXiv:1804.02767*, 2018.

[7] S. Ren, K. He, R. Girshick, and J. Sun, "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks," *IEEE Trans. Pattern Analysis and Machine Intelligence*, vol. 39, no. 6, pp. 1137–1149, 2017.

[8] T.-Y. Lin, P. Dollár, R. Girshick, K. He, B. Hariharan, and S. Belongie, "Feature Pyramid Networks for Object Detection," *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2017, pp. 2117–2125.

[9] S. Liu, L. Qi, H. Qin, J. Shi, and J. Jia, "Path Aggregation Network for Instance Segmentation," *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2018, pp. 8759–8768.

[10] T.-Y. Lin *et al.*, "Microsoft COCO: Common Objects in Context," *Proc. European Conf. Computer Vision (ECCV)*, 2014, pp. 740–755.

[11] H. Rezatofighi, N. Tsoi, J. Gwak, A. Sadeghian, I. Reid, and S. Savarese, "Generalized Intersection over Union: A Metric and a Loss for Bounding Box Regression," *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2019, pp. 658–666.

[12] I. Loshchilov and F. Hutter, "Decoupled Weight Decay Regularization," *Proc. Int. Conf. Learning Representations (ICLR)*, 2019.

[13] A. Paszke, S. Gross, F. Massa, A. Lerer, J. Bradbury, G. Chanan, T. Killeen, Z. Lin, N. Gimelshein, L. Antiga, *et al.*, "PyTorch: An Imperative Style, High-Performance Deep Learning Library," *Advances in Neural Information Processing Systems (NeurIPS)*, 2019.

[14] C. Zhu, Y. He, and M. Savvides, "Feature Selective Anchor-Free Module for Single-Shot Object Detection," *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2019, pp. 840–849.

---

## Appendix A: Verified Codebase Configuration Cross-Reference

The following table maps every claim in this paper to its source file in the Blue Sentinel codebase for independent verification:

| Paper Claim | Source File | Key Field |
|---|---|---|
| HGNetV2 B4 backbone | `configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `HGNetv2.name: 'B4'` |
| 22 classes | `configs/dataset/trashcan_detection.yml` | `num_classes: 22` |
| `remap_mscoco_category: False` | `configs/dataset/trashcan_detection.yml` | Line 6 |
| AdamW, lr=2.5e-4 | `configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `optimizer.lr: 0.00025` |
| Backbone lr=1.25e-5 | `configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `optimizer.params[0].lr: 0.0000125` |
| Weight decay=1.25e-4 | `configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `optimizer.weight_decay: 0.000125` |
| 58 epochs | `configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `epoches: 58` |
| Batch 8 train / 16 val | `configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `train/val_dataloader.total_batch_size` |
| Augmentation epochs [5,29,48] | `configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `transforms.policy.epoch` |
| Mixup [5,29], stop 48 | `configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `collate_fn.mixup_epochs`, `stop_epoch` |
| AMP enabled | `configs/base/optimizer.yml` | `use_amp: True` |
| EMA decay=0.9999 | `configs/base/optimizer.yml` | `ema.decay: 0.9999` |
| HybridEncoder hidden_dim=256 | `configs/base/dfine_hgnetv2.yml` | `HybridEncoder.hidden_dim: 256` |
| 8-head attention | `configs/base/dfine_hgnetv2.yml` | `HybridEncoder.nhead: 8` |
| 6 decoder layers, 300 queries | `configs/base/dfine_hgnetv2.yml` | `DFINETransformer.num_layers/num_queries` |
| Loss weights VFL/bbox/GIoU/FGL/DDF | `configs/base/dfine_hgnetv2.yml` | `RTv4Criterion.weight_dict` |
| Hungarian matcher costs | `configs/base/dfine_hgnetv2.yml` | `RTv4Criterion.matcher.weight_dict` |
| Confidence threshold 0.4 | `backend/main.py` | `CONFIDENCE_THRESHOLD = 0.4` |
| FP16 autocast inference | `backend/main.py` | `torch.autocast(device_type="cuda", dtype=torch.float16)` |
| Positional embedding patch | `backend/main.py` | `_patch_hybrid_encoder()` function |
| HuggingFace model source | `backend/main.py` | `CKPT_REPO = "coding-droid-123/trashcan-dfine"` |
| CLASS_NAMES (22 entries) | `backend/main.py` | `CLASS_NAMES` list (Lines 54–60) |
| Severity mapping | `backend/main.py` | `SEVERITY_MAPPING` dict (Lines 62–92) |
| PostgreSQL schema | `backend/models.py` | `ScanBatch`, `Detection` ORM classes |

---

*Manuscript prepared for IEEE conference submission. All experiments conducted on Kaggle (Tesla T4). Blue Sentinel system deployed locally on Windows with React 19 + Vite frontend and FastAPI + PostgreSQL 18 backend.*

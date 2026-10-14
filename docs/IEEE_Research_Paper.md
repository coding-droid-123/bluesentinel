# Blue Sentinel: Real-Time Underwater Marine Debris Detection, Edge Deployment, and Ecological Decision Support Using RT-DETRv4 with D-FINE on the TrashCan Dataset

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

Abstract—Marine debris accumulation in underwater environments presents a catastrophic ecological threat that is notoriously difficult to survey and quantify using manual diver inspections or unassisted robotic teleoperation. This paper presents **Blue Sentinel**, an end-to-end autonomous marine defense and ecological decision-support system that detects, localizes, tracks, and audits submerged anthropogenic debris and marine biodiversity in real time. At the algorithmic core, we fine-tune an **RT-DETRv4** detector featuring a high-performance **HGNetV2-L (B4)** convolutional backbone, a decoupled **HybridEncoder** (AIFI intra-scale self-attention and CCFM cross-scale fusion), and a **D-FINE** fine-grained distribution refinement decoder across **22 classes** of the **TrashCan-Instance** benchmark. Initialized from COCO-pretrained weights and trained for **58 epochs** on a single NVIDIA Tesla T4 GPU under strict batch constraints, the model achieves a mean Average Precision of **AP@[0.50:0.95] = 0.517**, **AP@0.50 = 0.686**, and **AP@0.75 = 0.555** on the validation split. 

We benchmark Blue Sentinel against the state-of-the-art base paper (*An improved YOLOv11 network for marine debris detection in underwater environment*, Jing et al., *Scientific Reports*, 2026), systematically analyzing the trade-offs between dense single-stage convolutional attention (YOLOv11 + MixStructureBlock + EMA at 416×416, achieving 81.54% mAP@0.5 at 5.20 MB) and end-to-end transformer set prediction (RT-DETRv4 + D-FINE at 640×640, achieving superior boundary retention and NMS-free high-IoU localization). To bridge laboratory modeling and offshore deployment, we implement an export pipeline compiling the PyTorch model into ONNX and TensorRT FP16 engines with dynamic optimization profiles, achieving real-time inference on edge GPUs. Furthermore, Blue Sentinel introduces an operational decision-support layer: an edge-in-the-loop **ROV Simulator** with real-time video streaming, a multi-tier persistence-gated alert engine that detects critical wildlife entanglements and ghost fishing gear, a density-weighted debris pile ranking algorithm, and a parametric **Cleanup Cost and Impact Optimizer** providing range-based operational budgeting. The complete platform is deployed via a FastAPI backend, PostgreSQL 18 with pgvector spatial persistence, a React 19 dashboard, and local Llama-3.1-8B LLM ecological audit synthesis over an encrypted zero-trust hybrid mesh.

Index Terms—Marine Debris Detection, Underwater Object Detection, RT-DETRv4, D-FINE, YOLOv11, MixStructureBlock, Efficient Multi-Scale Attention (EMA), TensorRT FP16, ROV Simulation, Ecological Decision Support, Ghost Gear Entanglement, TrashCan Dataset.

---

## I. INTRODUCTION

Marine debris contamination in marine benthic and pelagic zones has emerged as one of the most pressing anthropogenic threats to global ocean ecosystems. Millions of metric tons of non-biodegradable plastics, synthetic polymers, discarded fishing gear, and industrial waste enter marine environments annually [1]. Beyond visual degradation, submerged debris inflicts severe ecological mortality: ghost fishing gear (nets, ropes, longlines) continuously ensnares fish, marine mammals, and benthic organisms; degrading plastics leach persistent toxic additives into coastal food webs; and submerged debris piles smother delicate coral reefs and seagrass meadows [1], [5].

Quantifying and mitigating this crisis requires frequent, wide-area underwater visual monitoring. However, conventional manual visual surveys conducted by scientific divers or teleoperated Remotely Operated Vehicles (ROVs) are inherently slow, hazardous, expensive, and spatially localized. Automated computer-vision systems deployed on ROVs and Autonomous Underwater Vehicles (AUVs) offer a scalable alternative, but underwater optical imagery presents severe domain-specific degradation mechanisms [5], [15]:
1. **Wavelength-Dependent Optical Attenuation:** Seawater exponentially absorbs longer wavelengths (reds and yellows within the first 3–5 meters of water depth), heavily skewing ambient illumination into a low-contrast, monochromatic cyan/blue spectrum.
2. **Backscatter and Turbidity:** Suspended organic particulates ("marine snow") and floating silt scatter artificial ROV illuminators, creating severe backscatter haze, non-uniform vignetting, and obscured object silhouettes.
3. **Deformability and Benthic Crypsis:** Unlike rigid terrestrial objects, underwater debris items such as submerged tarps, fragmented packaging, and frayed ropes undergo continuous morphological deformation with currents and partial sediment burial. Simultaneously, benthic fauna (crabs, flatfish, starfish) have evolved intricate camouflage textures that mimic the seafloor substrate [1], [15].

Recent deep learning approaches on benchmark datasets such as **TrashCan** [1] have explored single-stage convolutional detectors (YOLO variants) [6], [15] and region-based detectors (Faster R-CNN) [7]. Most notably, the foundational literature by Jing et al. (*Scientific Reports*, 2026) [15] engineered an improved YOLOv11 network integrating **MixStructureBlock** and **Efficient Multi-Scale Attention (EMA)**, achieving remarkable detection recall and lightweight efficiency on 416×416 inputs. However, anchor-based and dense CNN architectures rely on hand-crafted Non-Maximum Suppression (NMS) heuristics, which struggle with sprawling, overlapping debris piles, and regress deterministic bounding box coordinates that frequently degrade under strict spatial overlap thresholds ($\text{IoU} \ge 0.75$).

To address these fundamental limitations and advance practical ocean conservation, this paper presents **Blue Sentinel**, an autonomous end-to-end marine debris detection, edge optimization, and ecological decision-support platform. Blue Sentinel adopts the state-of-the-art **RT-DETRv4** transformer architecture [4] combined with **D-FINE** fine-grained distribution refinement [2] and an **HGNetV2-L** backbone. By supervising bounding-box edge predictions as continuous probability distributions over discrete distance bins, the model eliminates NMS post-processing and delivers exceptional boundary localization precision.

### Key Contributions of This Work:
1. **Empirical Benchmarking on TrashCan-Instance (22 Classes):** We adapt and fine-tune RT-DETRv4 with D-FINE on the 22-class TrashCan-Instance dataset for 58 epochs, achieving $\text{AP}@[0.50:0.95] = 0.517$, $\text{AP}@0.50 = 0.686$, and $\text{AP}@0.75 = 0.555$, demonstrating near-perfect precision on rigid debris (up to 1.000 AP@0.50) while rigorously diagnosing the boundary failure modes of deformable plastics and cryptic organisms.
2. **In-Depth Comparative Analysis Against Foundational Literature:** We present a rigorous architectural and empirical comparative study against the state-of-the-art base paper by Jing et al. (*Scientific Reports*, 2026) [15], contrasting dense convolutional multi-scale attention (YOLOv11 + MixStructureBlock + EMA) with transformer set prediction (RT-DETRv4 + D-FINE) across latency, parameter count, resolution, and strict-IoU localization retention.
3. **Edge Optimization & High-Throughput Deployment Pipeline:** We implement an end-to-end model conversion pipeline that traces the complete PyTorch graph into ONNX and builds TensorRT FP16 execution engines with dynamic input profiling, alongside multi-threaded CPU fallbacks and zero-network local weight caching.
4. **Operational Decision Support & Edge-in-the-Loop ROV Simulation:** Moving beyond passive object classification, we engineer an operational decision layer featuring an edge-in-the-loop ROV video simulator, a persistence-gated multi-tier alert engine (surfacing active animal entanglement, ghost gear, and high-density debris piles), a weighted debris pile ranking algorithm, and a parametric Cleanup Cost and Impact Optimizer that outputs operational crew-hour and financial budget ranges for marine remediation campaigns.
5. **Full-Stack Deployment & Diagnostics:** We document a hybrid edge-cloud deployment topology (FastAPI, React 19, PostgreSQL 18 with pgvector, and local Llama-3.1-8B LLM ecological audit synthesis via Tailscale/Cloudflare), accompanied by a comprehensive diagnostic catalog resolving non-obvious runtime and training failures in transformer-based detectors.

---

## II. RELATED WORK & COMPARATIVE LITERATURE

### A. Underwater Visual Object Detection
Underwater computer vision has evolved from classical hand-crafted color-correction heuristics toward deep convolutional and transformer-based networks. The introduction of the TrashCan dataset by Hong et al. [1] provided the first large-scale, semantically segmented underwater marine debris benchmark, establishing standard evaluation protocols across 22 instance classes. Early baseline evaluations on TrashCan utilized Faster R-CNN [7] and SSD [14]. While accurate, two-stage detectors suffer from high inference latency (>100 ms), rendering them impractical for resource-constrained ROVs.

Subsequent research focused heavily on single-stage YOLO architectures [6]. Most recently, Jing et al. [15] (*Scientific Reports*, 2026, 16:7074) developed an enhanced YOLOv11 detector specifically optimized for underwater environments. Their work introduced the **MixStructureBlock**, replacing standard residual blocks with multi-branch dilated convolutions and composite channel-pixel attention to combat underwater haze, and integrated **Efficient Multi-Scale Attention (EMA)** [16] to enhance weak feature extraction. While achieving an impressive 81.54% mAP@0.5 with a compact 5.20 MB model, dense single-stage CNNs remain fundamentally constrained by deterministic coordinate regression and IoU-based NMS, which can cause duplicate detections or missed objects in dense, tangled debris piles.

### B. Real-Time Detection Transformers (DETR)
The Detection Transformer (DETR) paradigm pioneered by Carion et al. [17] reformulated object detection as direct set prediction, eliminating hand-crafted priors such as anchor boxes and NMS via bipartite matching with the Hungarian algorithm. RT-DETR [3] achieved the first real-time transformer detector by coupling a convolutional backbone with an efficient hybrid encoder that decouples intra-scale self-attention from cross-scale feature fusion.

D-FINE [2] overhauled the bounding box regression head in DETR architectures. Traditional detectors regress four scalar offsets $(c_x, c_y, w, h)$ supervised via smooth L1 or GIoU loss. D-FINE reformulates regression as Fine-Grained Localization (FGL), modeling each bounding box boundary offset as a continuous probability distribution across discrete distance bins. RT-DETRv4 [4] extends this framework with an HGNetV2 backbone, support for vision foundation model distillation, and structural re-parameterization.

### C. Multi-Scale Attention Mechanisms: EMA vs. AIFI Deformable Attention
Attention mechanisms in underwater vision serve to filter severe backscatter noise and accentuate weak object boundaries:
* **Efficient Multi-Scale Attention (EMA) [16]:** As deployed in the base paper [15], EMA groups feature channels into sub-spaces, extracts horizontal and vertical 1D directional global pooling representations, and computes cross-dimensional attention maps modulated by Group Normalization and Sigmoid gating. EMA is highly parameter-efficient and operates directly within convolutional necks.
* **AIFI Intra-Scale Attention [3], [4]:** In RT-DETRv4, Attention-based Intra-scale Feature Interaction (AIFI) applies multi-head self-attention exclusively to the deepest feature map ($P_5$). By operating on compact spatial tokens (20×20), AIFI captures global receptive fields and cross-object relationships across the entire visual scene with minimal computational overhead.
* **Deformable Cross-Attention [2], [4]:** In the DFINETransformer decoder, 300 learnable object queries interact with multi-scale feature pyramids through deformable cross-attention, sampling only a sparse set of key locations per query rather than attending to all tokens, thereby drastically reducing computational complexity while retaining fine spatial detail.

---

## III. DATASET & ANNOTATION PREPROCESSING

### A. The TrashCan-Instance Benchmark
We utilize the **TrashCan-Instance** dataset [1], annotated in standard MS-COCO format [10]. The benchmark comprises 7,212 underwater training images and 1,146 validation images spanning **22 classes** categorized into three primary semantic domains:
* **Equipment (1 class):** `rov` (survey hardware, robotic arms, thrusters).
* **Marine Organisms & Flora (7 classes):** `plant`, `animal_fish`, `animal_starfish`, `animal_shells`, `animal_crab`, `animal_eel`, `animal_etc`.
* **Anthropogenic Debris (14 classes):** `trash_clothing`, `trash_pipe`, `trash_bottle`, `trash_bag`, `trash_snack_wrapper`, `trash_can`, `trash_cup`, `trash_container`, `trash_unknown_instance`, `trash_branch`, `trash_wreckage`, `trash_tarp`, `trash_rope`, `trash_net`.

### B. Preprocessing & Zero-Indexing Normalization
The source TrashCan-Instance annotations utilize 1-indexed category identifiers ($\text{category\_id} \in [1, 22]$). In the RT-DETRv4 training configuration, MS-COCO category remapping is disabled (`remap_mscoco_category: False`) to preserve custom category semantics. Consequently, the data loader passes raw JSON `category_id` values directly to the classification loss head. Passing 1-indexed IDs to a 22-way classifier produces label indices spanning $[1, 22]$, exceeding the valid range of $[0, 21]$. This mismatch triggers a fatal CUDA device-side assertion failure inside the Hungarian matcher cost calculation.

To prevent this defect, we developed an automated preprocessing pipeline that standardizes all `categories[].id` and annotation `category_id` attributes to a contiguous 0-indexed range $[0, 21]$. A unified, deterministic mapping dictionary was shared across both training and validation splits to guarantee absolute cross-split semantic alignment.

---

## IV. PROPOSED DEEP LEARNING METHODOLOGY

### A. Model Architecture Pipeline
The core detector follows the **RT-DETRv4** architecture with **D-FINE** fine-grained distribution refinement, organized into three decoupled stages: Backbone, Hybrid Neck, and Distribution Decoder. Fig. 1 illustrates the structural dataflow.

```
┌─────────────────────────────────────────────────────────────────┐
│                    INPUT: Underwater Image (H×W)                │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼ [Resize(640,640), ToTensor()]
┌─────────────────────────────────────────────────────────────────┐
│  BACKBONE: HGNetV2-B4 (High-Performance GPU Net V2)            │
│  - StemBlock: Multi-branch ConvBNAct + MaxPool (Frozen)        │
│  - Stages 1–4: HG_Blocks with EseModule channel attention & LAB│
│  Output: Multi-Scale Pyramid {P₃, P₄, P₅} at strides {8,16,32}  │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  NECK: HybridEncoder                                            │
│  - 1×1 Projection Convolutions -> 256 channels                  │
│  - AIFI: 8-head Self-Attention exclusively on P₅ (20×20 tokens) │
│  - CCFM: Bidirectional FPN (top-down) + PAN (bottom-up)         │
│          via RepNCSPELAN4 blocks and SCDown modules             │
│  Output: Multi-Scale Fused Features F_fused ∈ R^{256 × H/s × W/s}│
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  DECODER: DFINETransformer (6 layers, 300 learnable queries)    │
│  - Multi-scale Deformable Cross-Attention                       │
│  - Classification Head: Class Logits S ∈ R^{300 × 22}           │
│  - Localization Head: FGL Distribution Head (N_reg = 32 bins)   │
│  - Contrastive Denoising Training (CDN)                         │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  POSTPROCESSOR: Embedded Integral & Dynamic Scale Restoration   │
│  - Coordinate Expectation: e_j = ∑ k · Softmax(w_{j,k}/τ) · s   │
│  - Native coordinate un-scaling via orig_target_sizes [W, H]    │
│  Output: Filtered Labels, Bounding Boxes, and Confidence Scores │
└─────────────────────────────────────────────────────────────────┘
```
*Fig. 1: End-to-end architectural pipeline of Blue Sentinel's RT-DETRv4 / D-FINE detector.*

#### 1) Backbone — HGNetV2-B4
The High-Performance GPU Network V2 (HGNetV2, B4 configuration) serves as the primary visual feature extractor. HGNetV2 balances convolutional throughput with multi-receptive-field representation. Key internal modules include:
* **StemBlock:** A multi-branch entry module with four sequential $3\times3$ convolutions and a MaxPool2d layer providing rapid $4\times$ spatial downsampling while preserving high-frequency edge information.
* **HG_Block (Hourglass Block):** The core building block, utilizing multi-branch convolutions with channel-split residual connections to extract deep hierarchical representations.
* **EseModule (Effective Squeeze-and-Excitation):** A lightweight channel attention mechanism replacing standard two-layer fully-connected bottlenecks with a single $1\times1$ convolution and Sigmoid gating, mitigating channel dimensionality reduction bottlenecks.
* **LearnableAffineBlock (LAB):** Per-channel learnable affine transformation layers ($\text{scale} \cdot x + \text{bias}$) that accelerate gradient convergence across deep stages.

#### 2) Neck — Decoupled HybridEncoder
The HybridEncoder decouples intra-scale self-attention from cross-scale feature fusion:
* **AIFI (Attention-based Intra-scale Feature Interaction):** Global self-attention is applied exclusively to the deepest feature map $P_5$ ($20\times20 = 400$ tokens at $640\times640$ input). Operating on 400 tokens with 8 attention heads ($\text{hidden\_dim}=256$, $\text{FFN}=1024$) captures global contextual relationships without the quadratic memory explosion ($O(N^2)$) incurred if applied to shallower feature maps ($P_3$ contains 6,400 tokens).
* **CCFM (Cross-scale Feature-Fusion Module):** Features are fused bidirectionally via top-down Feature Pyramid Networks (FPN) [8] and bottom-up Path Aggregation Networks (PAN) [9]. Convolutions are executed via `RepNCSPELAN4` blocks (CSP-ELAN with VGGBlock bottlenecks and structural re-parameterization) and `SCDown` spatial-channel downsampling modules.

#### 3) Decoder — DFINETransformer with Fine-Grained Distribution Refinement
A 6-layer deformable attention transformer decoder processes 300 learnable object queries against the multi-scale fused features. In traditional DETR detectors, bounding box coordinates are predicted deterministically as four normalized offsets $(c_x, c_y, w, h)$. Under severe underwater optical blur and turbidity, object boundaries are inherently ambiguous. D-FINE reformulates regression by modeling each bounding box boundary offset $e_j \in \{l, t, r, b\}$ (left, top, right, bottom relative to anchor centers) as a continuous probability distribution over $N_{\text{reg}} = 32$ discrete distance bins:

$$e_j = \sum_{k=0}^{N_{\text{reg}}} k \cdot \text{softmax}\left(\frac{w_{j,k}}{\tau}\right) \cdot s \quad (1)$$

where $w_{j,k}$ are the query logits for boundary $j$ at bin $k$, $\tau = 1.0$ is the distribution temperature parameter, and $s = 4.0$ is the regression scaling factor. Contrastive denoising training is incorporated with 100 denoising queries, a label noise ratio of 0.5, and a box noise scale of 1.0 to accelerate bipartite matching convergence.

#### 4) Multi-Task Loss Formulation
The network is trained end-to-end using a composite multi-task objective:

$$\mathcal{L}_{\text{total}} = \lambda_1 \mathcal{L}_{\text{VFL}} + \lambda_2 \mathcal{L}_{\text{L1}} + \lambda_3 \mathcal{L}_{\text{GIoU}} + \lambda_4 \mathcal{L}_{\text{FGL}} + \lambda_5 \mathcal{L}_{\text{DDF}} \quad (2)$$

where:
* $\mathcal{L}_{\text{VFL}}$ is the **Varifocal Loss** [18], which weights positive ground-truth targets by continuous IoU scores and negative samples by standard focal probabilities, resolving classification-localization score misalignment.
* $\mathcal{L}_{\text{L1}}$ is the smooth L1 bounding box coordinate distance.
* $\mathcal{L}_{\text{GIoU}}$ is the **Generalized Intersection over Union** loss [11], penalizing non-overlapping bounding box bounding space.
* $\mathcal{L}_{\text{FGL}}$ is the **Fine-Grained Localization** loss, an asymmetric focal-type loss supervising the unimodal probability distribution over the 32 discrete edge distance bins.
* $\mathcal{L}_{\text{DDF}}$ is the **Dense Distribution Fusion** loss, which distills edge distribution representations across intermediate decoder layers to provide deep supervision.

We configure the loss weighting hyper-parameters as:
$$\lambda_1 = 1.0, \quad \lambda_2 = 5.0, \quad \lambda_3 = 2.0, \quad \lambda_4 = 0.15, \quad \lambda_5 = 1.5 \quad (3)$$

Query-to-ground-truth assignment is computed via the Hungarian algorithm with cost weights: $\text{cost}_{\text{class}} = 2.0$, $\text{cost}_{\text{bbox}} = 5.0$, and $\text{cost}_{\text{GIoU}} = 2.0$.

### B. Training Configuration & Hyperparameters
Training was conducted on a single NVIDIA Tesla T4 GPU (15.6 GB VRAM) within a Kaggle containerized environment. Table I provides the complete hyperparameter specification.

TABLE I: Complete Training Hyperparameter Specification.

| Hyperparameter | Value / Configuration |
|---|---|
| Base Initialization | RT-DETRv4-L COCO-pretrained checkpoint |
| Input Resolution | $640 \times 640 \times 3$ |
| Target Classes | 22 (classification heads re-initialized from scratch) |
| Optimizer | AdamW ($\beta_1 = 0.9, \beta_2 = 0.999$) |
| Base Learning Rate | $2.5 \times 10^{-4}$ (heads, encoder, decoder) |
| Backbone Learning Rate | $1.25 \times 10^{-5}$ ($20\times$ reduced rate for transfer stability) |
| Weight Decay | $1.25 \times 10^{-4}$ (norm layers set to 0.0) |
| Backbone Freezing | `freeze_stem_only: True`, `freeze_at: 0`, `freeze_norm: True` |
| LR Scheduler | FlatCosine (`warmup_iter: 500`) |
| Total Training Epochs | 58 epochs |
| Batch Size | Train: 8, Validation: 16 |
| Numerical Precision | Automatic Mixed Precision (AMP) with FP32 master weights |
| EMA | Enabled (`decay: 0.9999`, `warmup: 1000`) |
| Gradient Clipping | `clip_max_norm: 0.1` |
| Augmentation Policy Transitions | Epochs 5, 29, and 48 |
| Mixup Duration | Active epochs 5 to 29 ($\beta \in [0.45, 0.55]$) |
| Stop Augmentation Boundary | Epoch 48 (final 10 epochs are augmentation-free) |
| Compute Platform | Single NVIDIA Tesla T4 GPU (15.6 GB VRAM) |

**Augmentation Schedule Rationale:** Underwater visual representations benefit from heavy composite augmentation during initial feature extraction, but fine-grained bounding-box probability distributions degrade if trained under extreme affine distortion near convergence. We implement a staged schedule: random photometric distortion (jittering brightness $[0.875, 1.125]$, contrast $[0.5, 1.5]$, and hue $[-0.05, 0.05]$ to emulate underwater spectral shifts) and Mosaic are applied from epoch 0. Mixup is activated at epoch 5 and terminated at epoch 29. Crucially, all augmentations are disabled at epoch 48 (`stop_epoch: 48`), providing an augmentation-free fine-tuning tail over the final ~17% of training to stabilize edge distribution representations.

---

## V. EDGE OPTIMIZATION & MODEL EXPORT PIPELINE

Deploying complex vision transformers onto marine robotic platforms requires eliminating Python interpreter overhead and leveraging hardware-level execution graphs. We developed a multi-format conversion and acceleration pipeline:

```
[PyTorch Checkpoint: best.pth]
              │
              ▼ (convert_pth_to_onnx.py)
[ExportWrapper: Model + Embedded Postprocessor]
              │
              ▼ (ONNX Graph Tracing with Opset 16)
[ONNX Model: best.onnx (Graph Simplified)]
              │
      ┌───────┴────────────────────────┐
      ▼ (convert_onnx_to_engine.py)     ▼ (evaluate_onnx_map.py)
[TensorRT FP16 Engine: best.engine]  [ONNX Runtime mAP Evaluation]
(Dynamic profiles: images, orig_size) (Cross-split COCO validation)
```
*Fig. 2: Edge compilation and verification workflow.*

### A. End-to-End ONNX Graph Export (`convert_pth_to_onnx.py`)
Traditional detector exports dump only the raw neural network backbone and decoder, requiring downstream runtimes to implement complex custom post-processing (softmax, integral expectation over 32 bins, coordinate scaling, confidence thresholding). We engineered an `ExportWrapper` module that fuses the deployed RT-DETRv4 model with its native `PostProcessor` into a single unified computational graph:
1. Traced with ONNX Opset 16, embedding dynamic batch dimensions across two runtime inputs: `images` ($[B, 3, 640, 640]$) and `orig_target_sizes` ($[B, 2]$).
2. The graph computes the integral expectation (Eq. 1) directly inside the ONNX graph and denormalizes bounding box coordinates to native input image dimensions.
3. Outputs three clean, tensor-native arrays: `labels` ($[B, 300]$), `boxes` ($[B, 300, 4]$ in $[x_1, y_1, x_2, y_2]$ coordinates), and `scores` ($[B, 300]$), completely eliminating client-side decoding dependencies.

### B. TensorRT FP16 Engine Generation (`convert_onnx_to_engine.py`)
To achieve high-frame-rate execution on NVIDIA Jetson embedded edge compute units and RTX series GPUs, the ONNX graph is compiled into a serialized TensorRT engine:
* **Precision:** Compiled with native FP16 Tensor Core execution flags (`trt.BuilderFlag.FP16`), halving VRAM footprint to ~1.8 GB and doubling inference throughput.
* **Optimization Profiles:** Configures explicit dynamic optimization profiles for input tensors:
  $$\text{images: } \min=(1, 3, 640, 640), \quad \text{opt}=(1, 3, 640, 640), \quad \max=(B_{\max}, 3, 640, 640)$$
  $$\text{orig\_target\_sizes: } \min=(1, 2), \quad \text{opt}=(1, 2), \quad \max=(B_{\max}, 2)$$
* **Memory Pool Management:** Allocates 4 GB of dedicated workspace memory to allow TensorRT's builder to benchmark and fuse multi-head attention kernels, layer norms, and convolutional layers into unified CUDA execution blocks.

### C. Multi-Threaded CPU Fallback & Zero-Download Local Caching
To ensure operational readiness when deployed on edge vessels lacking dedicated NVIDIA hardware:
* The FastAPI backend detects host capabilities at startup. Under CPU execution mode, the engine dynamically queries physical core counts via `multiprocessing.cpu_count()` and configures PyTorch intra-op and inter-op execution threads (`torch.set_num_threads(n_cores)`), achieving stable throughput on multi-core marine workstations.
* The model loader implements a zero-network local cache resolver (`_resolve_checkpoint`). If fine-tuned weights exist locally in `backend/weights/best.pth`, the model loads immediately with zero remote HTTP calls, ensuring rapid, reliable offline boots on sea vessels without internet connectivity.

---

## VI. OPERATIONAL SCALING & DECISION SUPPORT LAYER

Standard computer vision benchmarks evaluate models purely as passive object classifiers. In real-world ocean cleanups, cataloging hundreds of items without actionable prioritization overwhelms human operators. Blue Sentinel bridges this gap by introducing an operational decision layer that translates raw detection streams into real-time alerts, spatial pile rankings, and cleanup resource allocations.

### A. Edge-in-the-Loop ROV Simulator & Multi-Object Tracking (`ROVSimulator.jsx`)
To evaluate and demonstrate the platform under operational conditions without requiring access to an active offshore research vessel, we developed an edge-in-the-loop **ROV Simulator**:
1. **Telemetry & In-Memory Frame Extraction:** Simulates ROV camera feeds and extracts video frames directly in browser memory via HTML5 Canvas rasterization, dispatching compressed JPEG blobs without intermediate filesystem operations.
2. **Zero-Disk Streaming Endpoint:** Utilizes a dedicated `POST /detect?stream=true` endpoint in the FastAPI backend that bypasses synchronous database persistence during active playback, sustaining low-latency telemetry streaming.
3. **Multi-Object Tracking (MOT) via Spatial IoU Association:** Naive per-frame summation drastically inflates debris censuses by counting stationary or slow-moving items across multiple frames. To eliminate duplicate counting, Blue Sentinel incorporates an online spatial tracking algorithm:
   $$\text{IoU}(b_{\text{det}}, b_{\text{track}}) = \frac{\text{Area}(b_{\text{det}} \cap b_{\text{track}})}{\text{Area}(b_{\text{det}} \cup b_{\text{track}})} \ge 0.35$$
   For every frame $f$, detections are matched greedily to active object tracks sharing the identical category label $c$. Matched tracks inherit the persistent trajectory identifier $\text{ID}_k$, update coordinates $b_{\text{track}} \leftarrow b_{\text{det}}$, and reset their lost counter ($k_{\text{lost}} = 0$). Unmatched detections instantiate new tracks, incrementing the cumulative unique debris counter $N_{\text{unique}}$. Tracks unobserved for more than $k_{\text{lost}} > 8$ consecutive frames are pruned from active memory.

### B. Persistence-Gated Multi-Tier Alert Engine
In high-turbidity waters, transient false positives or harmless items (such as a single drifting soda can) should not interrupt ROV pilots. Blue Sentinel implements a multi-tier alert engine gated by temporal persistence across successive video frames (Table II).

TABLE II: Blue Sentinel Ecological Alert & Action Taxonomy.

| Event Type | Algorithmic Trigger Condition | Severity Tier | Operational Action |
|---|---|---|---|
| **Active Wildlife Entanglement** | Spatial bounding-box overlap between marine fauna (`animal_*`) and ghost gear (`trash_net`, `trash_rope`, `trash_tarp`) sustained across $\ge 3$ consecutive frames | **Critical** | Immediate acoustic/visual pilot alert; high-priority intervention recommendation |
| **Lethal Ghost Fishing Gear** | Detection of `trash_net`, `trash_rope`, or `trash_tarp` with confidence $s \ge 0.50$ and normalized area $\ge 0.05$ | **Critical** | Priority logging; immediate recovery planning; dynamic uncertainty flag |
| **High-Density Debris Pile** | Total detected debris count $N_{\text{debris}} \ge 5$ within a single frame or localized spatial cluster | **High** | Debris pile waypoint logged; cluster ranking calculation initiated |
| **Localized Debris Cluster** | Intermediate object concentration ($2 \le N_{\text{debris}} < 5$) | **Medium** | Logged to spatial scan history; scheduled for secondary sweep |
| **Isolated Minor Debris** | Single rigid container, bottle, or fabric ($N_{\text{debris}} = 1$) | **Low** | Passive telemetry logging; continuous environmental monitoring |

### C. Density-Weighted Debris Pile Ranking
When surveying benthic zones containing dozens of scattered waste clusters, cleanup vessels with limited dive times must prioritize high-impact sites. Blue Sentinel ranks detected debris clusters using a multi-factor ecological severity score:

$$\text{Severity Score} = \sum_{i=1}^{N} w(c_i) \cdot s_i \quad (4)$$

where $s_i$ is model confidence, and $w(c_i)$ is a domain-specific ecological risk weight:
* $w=3.0$ for ghost nets and heavy ropes (extreme entanglement and biological mortality hazards).
* $w=2.5$ for submerged tarps (smothering benthic flora and benthic fauna).
* $w=2.0$ for industrial wreckage and chemical pipes.
* $w=1.5$ for plastic containers, cans, and bags (chemical leaching and microplastic degradation).
* $w=1.0$ for consumer bottles and clothing.
* $w=0.8$ for organic branches and snack wrappers.

Clusters are sorted descending by score, allowing operators to deploy ROV manipulator arms or diver teams to high-yield sites first.

### D. Parametric Cleanup Cost & Impact Optimizer (`CleanupOptimizer.jsx`)
To support marine conservation agencies, port authorities, and environmental contractors in allocating limited budgets, Blue Sentinel incorporates a parametric Cleanup Cost and Impact Optimizer:
1. **Equipment Mapping:** Debris classes automatically dictate equipment requirements (e.g., ghost nets require hydraulic cutting shears and inflatable lift bags; wreckage requires heavy lift rigging; small plastic bottles require diver collection sacks).
2. **Parametric Crew-Hour Modeling:** Each debris class is assigned editable operational recovery time intervals $[t_{\min}, t_{\max}]$ (in hours per item) and minimum required crew personnel $C_c$.
3. **Range-Based Uncertainty Propagation:** Recognizing that underwater operations face severe environmental unpredictability (currents, depth, visibility), the optimizer carries survey uncertainty through every calculation, reporting costs and crew hours strictly as ranges:
   $$\text{Hours}_{\text{total}} = \left[ \sum_{c} t_{\min}(c) \cdot N_{\min}(c), \quad \sum_{c} t_{\max}(c) \cdot N_{\max}(c) \right] \quad (5)$$
   $$\text{Cost}_{\text{total}} = \text{Hours}_{\text{total}} \times C_{\max} \times R_{\text{crew}} + \text{Cost}_{\text{vessel}} \quad (6)$$
   where $R_{\text{crew}}$ is the hourly labor rate ($45/hr baseline) and $\text{Cost}_{\text{vessel}}$ represents fixed vessel transit expenses. This range-based formulation explicitly avoids promising unvalidated exact figures, providing realistic operational planning bounds.

---

## VII. SYSTEM ARCHITECTURE & DEPLOYMENT TOPOLOGY

```
Algorithm 1: Blue Sentinel Real-Time Inference, Alerting, and Audit Pipeline
Require: Raw underwater frame I ∈ R^{3×H×W}, confidence threshold τ = 0.40,
         stream flag f_stream, threat taxonomy M_threat, model weights W.
Ensure:  Filtered detections D*, alert set A, persistence record B_id, audit report R_pdf.
 1: Ingest frame I and extract native dimensions (W_orig, H_orig).
 2: Bilinearly resize I to 640×640 and linearly scale pixel values to [0.0, 1.0].
 3: Transfer tensor to compute device with torch.autocast(dtype=float16).
 4: Extract multi-scale feature pyramid {P_3, P_4, P_5} via HGNetV2-B4 backbone.
 5: Apply AIFI self-attention to P_5 and CCFM cross-scale fusion → F_fused.
 6: Decode 300 queries via DFINETransformer → class logits S, edge offsets e_j.
 7: Reconstruct bounding boxes via Eq. (1) and filter by confidence:
      D* = { (argmax(S_k), max(S_k), b_k) | max(S_k) ≥ τ }.
 8: Denormalize bounding box coordinates to (W_orig, H_orig).
 9: Assign ecological risk tiers: θ_k = M_threat(c_k) ∈ {Critical, High, Medium, Low}.
10: Evaluate real-time alerts A via Table II:
      - If animal overlaps ghost gear over consecutive frames → A ∪ {ENTANGLEMENT}.
      - If ghost gear detected with area ≥ 0.05 → A ∪ {GHOST_GEAR}.
      - If |D*| ≥ 5 → A ∪ {LARGE_PILE}.
11: Compute weighted debris pile severity score via Eq. (4).
12: If f_stream is True then
13:     Return JSON {image: B64_annotated, detections: D*, alerts: A} directly.
14: Else
15:     Insert ScanBatch and Detection records into PostgreSQL 18 asynchronously.
16:     Synthesize ecological audit via local Llama-3.1 LLM and render PDF report R_pdf.
17: End If
```

### A. Backend Engine & Three-Pillar Mission Database Architecture
The production backend is built on **FastAPI** with asynchronous execution pipelines serving RT-DETRv4 ONNX Runtime sessions alongside an ACID-compliant PostgreSQL 18 persistence layer. Rather than logging individual video frames—which would rapidly exhaust onboard solid-state storage during extended ROV deployments—Blue Sentinel introduces a **Three-Pillar Mission Architecture**:
1. **Pillar 1: Survey Missions & Transects (`survey_missions`):** Persists mission-level telemetry when an ROV survey concludes (`POST /missions/finish`). Captured fields include survey identifier, video source metadata, total transect duration (seconds), processed frame count, cumulative unique tracked debris count ($N_{\text{unique}}$), average inference FPS, model execution backend (ONNX Runtime / TensorRT), average latency (ms), and class-disaggregated debris frequency histograms.
2. **Pillar 2: Ecological Emergency Incidents & Hotspots (`mission_incidents`, `debris_hotspots`):** Persists high-priority environmental emergencies triggered by the alert engine (`POST /incidents`). When critical ghost gear or wildlife entanglement is detected, the system extracts a compressed JPEG snapshot crop of the incident frame and logs the timestamp, incident classification, severity level, affected marine fauna, and physical gear characteristics. Concurrently, top debris pile clusters exceeding density thresholds are stored in `debris_hotspots` with coordinates and class hazard rankings.
3. **Pillar 3: Marine Remediation Zones & Parametric Logistics (`cleanup_zones`, `cleanup_plans`):** Maintains operational inventories for surveyed maritime regions, tracking debris distributions, transit expenses, and priority indices. The optimizer endpoint (`POST /cleanup/optimize`) evaluates editable parametric diver recovery rates to calculate bounded crew-hour intervals, required recovery equipment, and total operational cost ranges, persisting finalized remediation plans into `cleanup_plans`.

Additionally, a Zero-Trust Hybrid Mesh links the public React frontend with edge servers via a Cloudflare Zero-Trust tunnel (`cloudflared`), while LLM reporting workloads are secured over an encrypted Tailscale WireGuard overlay network.

### B. Local Generative AI Ecological Audit Synthesis
While visual detectors output discrete bounding boxes, environmental compliance agencies require structured executive narratives. Blue Sentinel integrates local Generative AI powered by **Ollama** running **Llama-3.1 (8B)** quantized to Q4_K_M (~4.8 GB memory footprint):
* Telemetry records, debris counts, ghost gear detections, and ecological severity distributions are formatted into structured JSON prompts.
* The local LLM synthesizes natural-language environmental impact assessments, highlights critical marine fauna threats, and formulates remediation recommendations without transferring sensitive environmental survey data to commercial cloud APIs.

### C. Interactive Presentation Dashboard (React 19)
The user interface is engineered in React 19 and Vite with Tailwind CSS v4:
* **Interactive Inspection Canvas:** Displays high-resolution annotated images or real-time ROV video streams with toggleable bounding boxes, category-specific color coding, and a real-time confidence slider.
* **Audit Reporting Module:** Renders comprehensive Environmental Impact Audit reports exportable to publication-grade PDF documents via `html2canvas` and `jsPDF`.

---

## VIII. EXPERIMENTAL RESULTS & COMPARATIVE EVALUATION

### A. Overall Detection Metrics
Table III reports the overall COCO-style detection metrics achieved by Blue Sentinel after 58 epochs on the TrashCan-Instance validation set.

TABLE III: Overall Detection Metrics on TrashCan-Instance Validation Split.

| Metric | Evaluation Parameters | Value |
|---|---|---|
| **AP @ [0.50:0.95]** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{all}$, $\text{maxDets}=100$ | **0.517** |
| **AP @ 0.50** | $\text{IoU}=0.50$, $\text{area}=\text{all}$, $\text{maxDets}=100$ | **0.686** |
| **AP @ 0.75** | $\text{IoU}=0.75$, $\text{area}=\text{all}$, $\text{maxDets}=100$ | **0.555** |
| **AP (Small)** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{small}$, $\text{maxDets}=100$ | 0.392 |
| **AP (Medium)** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{medium}$, $\text{maxDets}=100$ | 0.556 |
| **AP (Large)** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{large}$, $\text{maxDets}=100$ | 0.762 |
| **AR @ 1** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{all}$, $\text{maxDets}=1$ | 0.584 |
| **AR @ 10** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{all}$, $\text{maxDets}=10$ | 0.711 |
| **AR @ 100** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{all}$, $\text{maxDets}=100$ | 0.733 |
| **AR (Small)** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{small}$, $\text{maxDets}=100$ | 0.672 |
| **AR (Medium)** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{medium}$, $\text{maxDets}=100$ | 0.701 |
| **AR (Large)** | $\text{IoU}=0.50:0.95$, $\text{area}=\text{large}$, $\text{maxDets}=100$ | 0.872 |
| **AR @ 0.50** | $\text{IoU}=0.50$, $\text{area}=\text{all}$, $\text{maxDets}=100$ | 0.936 |
| **AR @ 0.75** | $\text{IoU}=0.75$, $\text{area}=\text{all}$, $\text{maxDets}=100$ | 0.816 |

Table IV illustrates the training progression from the initial 24-epoch baseline to the extended 58-epoch schedule. Extending training with an augmentation-free tail yields a +2.2 mAP gain, confirming the necessity of distribution stabilization.

TABLE IV: Training Progression on TrashCan-Instance.

| Checkpoint Stage | Total Epochs | AP @ [0.50:0.95] | AP @ 0.50 | $\Delta\text{AP@[.50:.95]}$ |
|---|---|---|---|---|
| Initial Baseline Run | 24 | 0.495 | — | — |
| Extended Schedule (Final) | 58 | **0.517** | **0.686** | **+0.022** |

### B. Per-Class Average Precision and Localization Sensitivity
Table V provides the comprehensive per-class metric breakdown across all 22 classes, including absolute localization drop ($\Delta\text{AP}_{0.50 \to 0.75}$) and the **Localization Retention Ratio** ($\frac{\text{AP@0.75}}{\text{AP@0.50}}$).

TABLE V: Comprehensive Per-Class Detection Metrics on TrashCan-Instance Validation Split.

| Class Name | AP@[.50:.95] | AP@0.50 | AP@0.75 | $\Delta\text{AP}_{0.50 \to 0.75}$ | Retention Ratio | Semantic Group |
|---|---|---|---|---|---|---|
| `rov` | 0.839 | 0.956 | 0.889 | -0.067 | 93.0% | Equipment |
| `plant` | 0.484 | 0.741 | 0.517 | -0.224 | 69.8% | Marine Life |
| `animal_fish` | 0.331 | 0.643 | 0.327 | -0.316 | 50.9% | Marine Life |
| `animal_starfish` | 0.488 | 0.861 | 0.484 | -0.377 | 56.2% | Marine Life |
| `animal_shells` | 0.253 | 0.430 | 0.267 | -0.163 | 62.1% | Marine Life |
| `animal_crab` | 0.228 | 0.372 | 0.259 | -0.113 | 69.6% | Marine Life |
| `animal_eel` | 0.544 | 0.758 | 0.632 | -0.126 | 83.4% | Marine Life |
| `animal_etc` | 0.412 | 0.600 | 0.421 | -0.179 | 70.2% | Marine Life |
| `trash_clothing` | 0.419 | 0.469 | 0.469 | 0.000 | 100.0% | Debris |
| `trash_pipe` | 0.913 | 1.000 | 0.909 | -0.091 | 90.9% | Debris |
| `trash_bottle` | 0.665 | 0.824 | 0.758 | -0.066 | 92.0% | Debris |
| `trash_bag` | 0.557 | 0.782 | 0.644 | -0.138 | 82.4% | Debris |
| `trash_snack_wrapper` | 0.419 | 0.420 | 0.420 | 0.000 | 100.0% | Debris |
| `trash_can` | 0.586 | 0.844 | 0.672 | -0.172 | 79.6% | Debris |
| `trash_cup` | 0.614 | 0.687 | 0.687 | 0.000 | 100.0% | Debris |
| `trash_container` | 0.594 | 0.699 | 0.676 | -0.023 | 96.7% | Debris |
| `trash_unknown_instance` | 0.503 | 0.773 | 0.539 | -0.234 | 69.7% | Debris |
| `trash_branch` | 0.624 | 0.747 | 0.713 | -0.034 | 95.5% | Debris |
| `trash_wreckage` | 0.677 | 0.820 | 0.705 | -0.115 | 86.0% | Debris |
| `trash_tarp` | 0.158 | 0.218 | 0.169 | -0.049 | 77.5% | Debris |
| `trash_rope` | 0.441 | 0.543 | 0.483 | -0.060 | 89.0% | Debris |
| `trash_net` | 0.614 | 0.899 | 0.576 | -0.323 | 64.1% | Debris |
| **MACRO MEAN** | **0.517** | **0.686** | **0.555** | **-0.131** | **80.9%** | — |

### C. Semantic Domain Disaggregation
Disaggregating metrics across the three semantic domains (Table VI) reveals profound performance discrepancies. Anthropogenic debris outperforms marine life across all evaluative metrics (+16.5 points in AP@[.50:.95], +6.6 points in AP@0.50, and +18.6 points in AP@0.75). Furthermore, debris maintains substantially superior boundary retention under strict spatial overlap (86.5% vs. 66.0%).

TABLE VI: Macro-Averaged Detection Metrics Disaggregated by Semantic Domain.

| Semantic Domain | Class Count ($N$) | Mean AP@[.50:.95] | Mean AP@0.50 | Mean AP@0.75 | Retention Ratio |
|---|---|---|---|---|---|
| **Equipment (`rov`)** | 1 | **0.839** | **0.956** | **0.889** | **93.0%** |
| **Anthropogenic Debris** | 14 | **0.556** | **0.695** | **0.601** | **86.5%** |
| **Marine Organisms & Flora** | 7 | **0.391** | **0.629** | **0.415** | **66.0%** |
| **Overall Dataset Macro Mean** | 22 | 0.517 | 0.686 | 0.555 | 80.9% |

### D. Deep Comparative Benchmarking: Blue Sentinel vs. Base Paper (YOLOv11 + MixStructureBlock + EMA)
To contextualize Blue Sentinel within contemporary literature, we conduct a systematic comparative analysis against the state-of-the-art base paper by Jing et al. (*Scientific Reports*, 2026, 16:7074) [15].

TABLE VII: Side-by-Side Architectural & Empirical Comparison.

| Architectural Dimension | Base Paper Model (Jing et al., 2026) [15] | Blue Sentinel Deployed Model (Ours) |
|---|---|---|
| **Underlying Architecture** | Enhanced YOLOv11 (Dense Single-Stage CNN) | RT-DETRv4 + D-FINE (Real-Time Vision Transformer) |
| **Backbone Module** | YOLOv11 Backbone with `MixStructureBlock` | `HGNetV2-B4` (GPU High-Performance Net) |
| **Feature Neck** | PANet with `EMA` and `MixStructureBlock` | `HybridEncoder` (`AIFI` on $P_5$ + `CCFM` Fusion) |
| **Decoder / Prediction Head** | Decoupled Anchor-Free Convolutional Head | 6-Layer `DFINETransformer` (300 Learned Queries) |
| **Bounding Box Regression** | Direct deterministic regression $(c_x, c_y, w, h)$ | Fine-Grained Localization (32 edge distribution bins) |
| **Post-Processing** | Requires IoU Non-Maximum Suppression (NMS) | **NMS-Free** (Direct set prediction via Hungarian matching) |
| **Input Image Resolution** | $416 \times 416 \times 3$ | $640 \times 640 \times 3$ |
| **Model Size / Parameter Count** | **5.20 MB** (~2.6M parameters) | **~38 MB** (~32M parameters) |
| **Target Hardware Profile** | Ultralight micro-AUVs / embedded microcontrollers | GPU-accelerated edge servers / workstation ROVs |
| **Training Budget** | 180 epochs, batch size 128, cosine schedule | 58 epochs, batch size 8, AdamW, single T4 GPU |
| **Instance mAP@0.5** | **81.54%** (Precision: 82.05%, Recall: 86.75%) | **68.6%** (0.686) |
| **Instance mAP@[0.50:0.95]** | *Not reported across all splits* | **51.7%** (0.517) |
| **Strict Localization (mAP@0.75)**| *Not reported* | **55.5%** (0.555) |
| **Operational Decision Layer** | None (offline metric evaluation) | ROV simulator, real-time alerts, cleanup optimizer |

#### 1) Ablation Insights from Base Paper
Jing et al. isolated the individual and joint contributions of `MixStructureBlock` and `EMA` on TrashCan-Instance (Table VIII).

TABLE VIII: Base Paper Ablation Study on TrashCan-Instance [15].

| Model Variant | Precision (%) | Recall (%) | F1-Score | mAP@0.5 (%) |
|---|---|---|---|---|
| Baseline YOLOv11 | 82.08% | 64.06% | 0.72 | 68.06% |
| YOLOv11 + EMA | 81.12% | **76.31% (+12.25%)** | 0.79 | **78.93% (+10.87%)** |
| YOLOv11 + MixStructureBlock | **87.11% (+5.03%)** | 75.05% | 0.81 | **79.80% (+11.74%)** |
| **Full Proposed Model** | 82.05% | **86.75% (+22.69%)** | **0.84** | **81.54% (+13.48%)** |

* **MixStructureBlock acts as a Precision Booster:** Parallel multi-scale convolutions ($3\times3, 5\times5, 7\times7$) with dilated paths ($d=3$) and compound pixel/channel attention extract clean geometric structures from turbid backgrounds, raising precision by +5.03%.
* **EMA acts as a Recall Booster:** Group-wise channel partitioning combined with 1D directional coordinate pooling and cross-spatial interaction enables the network to retrieve weak, occluded debris that standard convolutions miss, driving recall up by +12.25%.

#### 2) Metric Discrepancy & Algorithmic Trade-Off Analysis
While the base paper achieves a higher mAP@0.5 (81.54% vs. 68.6%), our analysis identifies critical factors underlying this divergence:
1. **Training Regimes & Compute Budgets:** The base paper trained for **180 epochs** with an optimal batch size of **128** on local hardware. In contrast, Blue Sentinel was fine-tuned for **58 epochs** with a constrained batch size of **8** on a single cloud GPU. Transformer architectures require substantially longer training schedules to fully saturate cross-attention query representations.
2. **Deterministic Regression vs. Distribution Modeling:** YOLO regresses single scalar coordinates evaluated at a lenient IoU threshold of 0.50. D-FINE supervises continuous probability distributions across 32 discrete edge bins, optimizing specifically for high-IoU boundary fidelity. Blue Sentinel retains **55.5% AP@0.75** and **51.7% AP@[.50:.95]**, providing reliable physical boundaries essential for robotic manipulation.
3. **Rigid vs. Deformable Object Disparity:** On rigid man-made objects, Blue Sentinel matches or surpasses the base paper: `trash_pipe` achieves **100% AP@0.50** (0.913 AP@[.50:.95]), `rov` achieves **95.6% AP@0.50**, `trash_net` achieves **89.9% AP@0.50**, and `trash_can` achieves **84.4% AP@0.50**. The overall macro average is pulled down by extreme amorphous failure modes (`trash_tarp` at 0.218 AP@0.50) and cryptic benthic organisms (`animal_crab` at 0.372).

---

## IX. ANALYSIS AND DISCUSSION

### A. Boundary Stability in Rigid Debris
Rigid anthropogenic objects (`trash_pipe`, `rov`, `trash_bottle`, `trash_wreckage`) form the top-performing cluster. Under D-FINE distribution regression (Eq. 1), sharp contrast gradients against seabed silt cause edge probability logits to converge onto unimodal distribution peaks. Consequently, `trash_pipe` retains 90.9% of its precision and `rov` retains 93.0% when the IoU threshold tightens from 0.50 to 0.75.

### B. Crypsis and Optical Divide in Marine Life
The 16.5-point gap in mean AP@[.50:.95] between debris (0.556) and marine life (0.391) stems from two phenomena:
1. **Benthic Crypsis:** Benthic fauna (`animal_crab`, `animal_shells`) possess structural carapaces evolved specifically to blend into rocky crevices and silt, confusing convolutional feature extraction under turbid lighting.
2. **Wavelength Attenuation:** Depletion of red and yellow light shifts scenes toward monochromatic blue-green [5]. While man-made polymers exhibit distinct specular reflectance, natural marine fauna blend seamlessly into the ambient chromatic background.

### C. Localization Collapse in Deformable & Porous Morphologies
Evaluating models across standard IoU thresholds exposes the **Localization Collapse Phenomenon**, where a class achieves high coarse recall at IoU=0.50 but suffers severe precision loss at IoU=0.75:
* `animal_fish` ($0.643 \to 0.327$, -49.1% drop): Body undulation and transparent fins create bounding box ambiguity.
* `animal_starfish` ($0.861 \to 0.484$, -43.8% drop): Pentaradial star geometry occupies only a fraction of its bounding box.
* `trash_net` ($0.899 \to 0.576$, -35.9% drop): Abandoned ghost nets rank 3rd in the entire dataset at AP@0.50 (0.899) due to distinct diamond mesh textures. However, because floating nets billow across currents in porous, sprawling sheets, establishing a crisp rectangular bounding perimeter is ambiguous, leading to severe penalties under strict IoU constraints.

### D. The Detection-Bound vs. Localization-Bound Plateau
Three debris classes exhibit flat performance curves between IoU=0.50 and IoU=0.75: `trash_snack_wrapper` (0.420 $\to$ 0.420, 100% retention), `trash_clothing` (0.469 $\to$ 0.469, 100% retention), and `trash_cup` (0.687 $\to$ 0.687, 100% retention). These categories are **detection-bound**: once the model overcomes false-negative thresholds and identifies an instance, the D-FINE regression head locates its boundary with high fidelity ($\text{IoU} \ge 0.75$).

### E. Extreme Amorphous Debris: The `trash_tarp` Failure Mode
`trash_tarp` represents the global minimum across all metrics: AP@[.50:.95] = 0.158, AP@0.50 = 0.218, and AP@0.75 = 0.169. Submerged tarps drape arbitrarily over seabed contours, fragment into jagged strips, and rapidly accumulate settling sediment and algae, leaving only 10–30% visible surface area.

---

## X. IMPLEMENTATION NOTES & RUNTIME DIAGNOSTIC ENGINEERING

Adapting the RT-DETRv4 codebase to custom marine datasets revealed several non-obvious engineering failure modes:

### A. Checkpoint Lifecycle & Staged Training Exceptions
The RT-DETRv4 solver implements a staged training scheme demarcated by `stop_epoch` (epoch 48 of 58):
1. **Missing Stage 1 Checkpoint (`FileNotFoundError`):** In `det_solver.py`, the transition logic attempts to load `self.output_dir / 'best_stg1.pth'`. If evaluation was skipped or failed to beat baseline metrics during Stage 1, `best_stg1.pth` is never written, crashing Stage 2 with a `FileNotFoundError`. **Mitigation:** Wrap `load_resume_state` with a filesystem guard `(self.output_dir / 'best_stg1.pth').is_file()`.
2. **Metric Loop Creep:** In `det_solver.py`, checkpoint saving logic was nested inside the `for k in test_stats:` evaluation loop. When evaluation returns multiple keys (e.g., `coco_eval_bbox` and `loss`), EMA decay decremented multiple times per epoch. **Mitigation:** Un-nest checkpoint evaluation outside the dictionary loop.

### B. Device-Mismatched Positional Embeddings
In unpatched `hybrid_encoder.py`, positional embedding tensors (`pos_embed`) were initialized on CPU while feature maps resided on `cuda:0`, triggering runtime device mismatch errors during the first forward pass. **Resolution:** We inject an in-place patch in `backend/main.py` explicitly moving embeddings to active tensor devices (`pos_embed = pos_embed.to(src_flatten.device)`).

### C. Autograd In-Place Mutations & Degenerate Boxes
Modifying bounding box coordinates in-place (`boxes[:, 0] += offset`) within `RTv4Criterion` corrupts PyTorch's backward computational graph. All coordinate transformations must be performed out-of-place via tensor concatenation. Furthermore, degenerate annotations where $w \le 0$ or $h \le 0$ cause Generalized IoU loss denominators to evaluate to zero, triggering `NaN` gradients. Divisors must be clamped: `num_boxes = max(num_boxes, 1)`.

---

## XI. LIMITATIONS

1. **Single-Run Stochasticity:** Results reflect a single training run per configuration; multi-seed variance analysis has not been conducted due to compute constraints.
2. **Annotation Imbalance:** Performance metrics have not yet been normalized against training set annotation frequency; class-frequency disparities may compound visual crypsis challenges.
3. **Hardware Constraints:** Training utilized a single Tesla T4 GPU with batch size 8; scaling to multi-GPU clusters with larger effective batch sizes may improve feature representations.
4. **Parametric Optimizer Assumptions:** The Cleanup Cost and Impact Optimizer relies on editable domain assumptions (crew hourly rates, time per item) that require operational calibration against empirical salvage campaign logs.

---

## XII. FUTURE WORK

1. **Turbidity-Aware Foundation Distillation:** Integrate DINOv3 or SAM-2 foundation feature distillation into the RT-DETRv4 hybrid encoder to improve boundary discovery on thin, camouflaged plastics.
2. **Underwater Physical Restoration:** Integrate a lightweight physical image restoration module (e.g., Sea-thru or Water-Net) into the preprocessing pipeline to mitigate wavelength attenuation prior to transformer tokenization.
3. **Class-Reweighted Focal Loss:** Implement dynamic class-frequency loss weighting to alleviate severe class imbalance on rare categories (`trash_tarp`, `animal_crab`).
4. **Autonomous AUV Integration:** Package the compiled TensorRT FP16 engine and tracking pipeline into a ROS 2 node for onboard deployment on physical BlueROV2 vehicles.

---

## XIII. CONCLUSION

This paper presented **Blue Sentinel**, an end-to-end underwater marine debris detection, edge optimization, and ecological decision-support system. By fine-tuning an **RT-DETRv4** detector with an **HGNetV2-L** backbone and **D-FINE** distribution refinement on the 22-class TrashCan-Instance dataset for 58 epochs, the model achieves $\text{AP}@[0.50:0.95] = 0.517$, $\text{AP}@0.50 = 0.686$, and $\text{AP}@0.75 = 0.555$. Comparative benchmarking against the state-of-the-art YOLOv11 + MixStructureBlock + EMA baseline reveals the distinct strengths of transformer set prediction, specifically superior boundary retention (up to 1.000 AP@0.50 on rigid pipes) and NMS-free set prediction. By coupling deep learning with an ONNX/TensorRT edge export pipeline, an edge-in-the-loop ROV simulator, persistence-gated entanglement alerts, and a parametric cleanup decision optimizer, Blue Sentinel bridges the gap between laboratory benchmarking and operational marine conservation.

---

## REFERENCES

[1] J. Hong, M. Fulton, and J. Sattar, "TrashCan: A Semantically-Segmented Dataset towards Visual Detection of Marine Debris," *arXiv preprint arXiv:2007.08097*, 2020.

[2] Y. Peng *et al.*, "D-FINE: Redefine Regression Task in DETRs as Fine-grained Distribution Refinement," *arXiv preprint arXiv:2410.13842*, 2024.

[3] Y. Zhao *et al.*, "DETRs Beat YOLOs on Real-time Object Detection," in *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2024, pp. 16965–16974.

[4] RT-DETRv4 Authors, "RT-DETRv4: Painlessly Furthering Real-Time Object Detection with Vision Foundation Models," GitHub repository, 2025. [Online]. Available: https://github.com/RT-DETRs/RT-DETRv4

[5] J. S. Jaffe, "Underwater Optical Imaging: The Past, the Present, and the Prospects," *IEEE Journal of Oceanic Engineering*, vol. 40, no. 3, pp. 683–700, 2015.

[6] J. Redmon and A. Farhadi, "YOLOv3: An Incremental Improvement," *arXiv preprint arXiv:1804.02767*, 2018.

[7] S. Ren, K. He, R. Girshick, and J. Sun, "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks," *IEEE Trans. Pattern Anal. Mach. Intell.*, vol. 39, no. 6, pp. 1137–1149, 2017.

[8] T.-Y. Lin *et al.*, "Feature Pyramid Networks for Object Detection," in *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2017, pp. 2117–2125.

[9] S. Liu *et al.*, "Path Aggregation Network for Instance Segmentation," in *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2018, pp. 8759–8768.

[10] T.-Y. Lin *et al.*, "Microsoft COCO: Common Objects in Context," in *Proc. European Conf. Computer Vision (ECCV)*, 2014, pp. 740–755.

[11] H. Rezatofighi *et al.*, "Generalized Intersection over Union: A Metric and a Loss for Bounding Box Regression," in *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2019, pp. 658–666.

[12] I. Loshchilov and F. Hutter, "Decoupled Weight Decay Regularization," in *Proc. Int. Conf. Learning Representations (ICLR)*, 2019.

[13] A. Paszke *et al.*, "PyTorch: An Imperative Style, High-Performance Deep Learning Library," in *Advances in Neural Information Processing Systems (NeurIPS)*, 2019.

[14] W. Liu *et al.*, "SSD: Single Shot MultiBox Detector," in *Proc. European Conf. Computer Vision (ECCV)*, 2016, pp. 21–37.

[15] Y. Jing, Y. Ding, X. Wang, and S. M. Khairuddin, "An Improved YOLOv11 Network for Marine Debris Detection in Underwater Environment," *Scientific Reports*, vol. 16, no. 1, art. no. 7074, 2026.

[16] D. Ouyang *et al.*, "Efficient Multi-Scale Attention Module with Cross-Spatial Learning," in *Proc. IEEE Int. Conf. Acoustics, Speech and Signal Processing (ICASSP)*, 2023, pp. 1–5.

[17] N. Carion *et al.*, "End-to-End Object Detection with Transformers," in *Proc. European Conf. Computer Vision (ECCV)*, 2020, pp. 213–229.

[18] H. Zhang *et al.*, "VarifocalNet: An IoU-aware Dense Object Detector," in *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2021, pp. 8514–8523.

---

## Appendix A: Verified Codebase Configuration Cross-Reference

| Research Paper Claim | Source File in Repository | Verified Implementation Parameter |
|---|---|---|
| HGNetV2-B4 Backbone | `backend/RT-DETRv4/configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `HGNetv2.name: 'B4'` |
| 22 Target Classes | `backend/RT-DETRv4/configs/dataset/trashcan_detection.yml` | `num_classes: 22` |
| 0-Indexed Category IDs | `backend/check_val_json.py` & `evaluate_onnx_map.py` | Category IDs normalized to $[0, 21]$ |
| AdamW Learning Rates | `backend/RT-DETRv4/configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `lr: 0.00025`, `backbone_lr: 0.0000125` |
| 58 Training Epochs | `backend/RT-DETRv4/configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `epoches: 58` |
| Batch Size (8 / 16) | `backend/RT-DETRv4/configs/dfine/dfine_hgnetv2_l_trashcan.yml` | `total_batch_size: 8` (train), `16` (val) |
| Augmentation Transitions | `backend/RT-DETRv4/configs/dfine/dfine_hgnetv2_l_trashcan.yml` | Policy epochs $[5, 29, 48]$; stop at 48 |
| HybridEncoder Architecture | `backend/RT-DETRv4/engine/rtv4/hybrid_encoder.py` | AIFI on $P_5$ (dim=256, nhead=8), CCFM fusion |
| DFINETransformer Heads | `backend/RT-DETRv4/engine/rtv4/dfine_decoder.py` | 6 layers, 300 queries, $N_{\text{reg}}=32$ bins |
| Composite Loss Weights | `backend/RT-DETRv4/engine/rtv4/rtv4_criterion.py` | VFL: 1.0, L1: 5.0, GIoU: 2.0, FGL: 0.15, DDF: 1.5 |
| ONNX Export Wrapper | `backend/convert_pth_to_onnx.py` | `ExportWrapper` embedding model + postprocessor |
| TensorRT FP16 Compilation | `backend/convert_onnx_to_engine.py` | `BuilderFlag.FP16` with dynamic profile optimization |
| ONNX mAP Evaluator | `backend/evaluate_onnx_map.py` | `faster_coco_eval` COCO metric calculation |
| Real-Time Streaming Mode | `backend/main.py` | `POST /detect?stream=true` skipping disk/DB writes |
| Local Checkpoint Resolver | `backend/main.py` | `_resolve_checkpoint()` zero-network loading |
| Ecological Threat Mapping | `backend/main.py` | `SEVERITY_MAPPING` dictionary (Lines 58–92) |
| ROV Video Simulator | `frontend/src/components/ROVSimulator.jsx` | Telemetry loop, track IDs, entanglement alerts |
| Cleanup Decision Optimizer | `frontend/src/components/CleanupOptimizer.jsx` | Equipment mapping, crew hours & budget ranges |
| PostgreSQL Schema | `backend/models.py` | `ScanBatch` and `Detection` relational ORM tables |

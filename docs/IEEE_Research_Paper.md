# Blue Sentinel: Reproducible Marine Debris Detection and an Edge-to-Decision Operational Pipeline

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

Abstract—Underwater marine debris monitoring is hindered by severe optical degradation and the operational disconnect between laboratory object detectors and offshore remediation decisions. This paper presents **Blue Sentinel**, a reproducible evaluation framework and deployable edge-to-decision pipeline for underwater debris monitoring structured across three integrated pillars. In Pillar 1 (Edge Vision and Tracking), we evaluate RT-DETRv4 with D-FINE distribution refinement across the 22-class TrashCan-Instance benchmark. Trained for 58 epochs on an NVIDIA Tesla T4 GPU, the model achieves $\text{AP}@[0.50:0.95] = 0.517$, $\text{AP}@0.50 = 0.686$, and $\text{AP}@0.75 = 0.555$, retaining high boundary fidelity on rigid waste while eliminating Non-Maximum Suppression. We deploy this via ONNX and TensorRT FP16 runtimes coupled with spatial multi-object tracking and gap-triggered reset heuristics to eliminate duplicate censuses. In Pillar 2 (Threat Triage), a persistence-gated alert engine flags active wildlife entanglements and lethal ghost gear while scoring transect debris density. In Pillar 3 (Logistics Planning), an illustrative optimizer combines bathymetric depth constraints with parametric recovery intervals to estimate diver and robotic operational costs. Rather than claiming state-of-the-art performance, we establish a standardized benchmark, provide an open edge-to-decision pipeline, and quantify boundary failure modes in cryptic marine environments.

Index Terms—Marine Debris Detection, Real-Time Detection Transformer (RT-DETR), D-FINE, Multi-Object Tracking, Edge Deployment, TensorRT, Underwater Vision, TrashCan Benchmark, Ecological Decision Support.

---

## I. INTRODUCTION

Marine debris contamination across benthic and pelagic zones poses an accelerating ecological crisis. Discarded plastics, synthetic packaging, and abandoned fishing gear continuously leach toxic additives, smother biogenic reef substrates, and inflict lethal mortality on marine organisms through ghost fishing [1], [5]. Mitigating this crisis requires systematic visual monitoring. However, conventional manual visual surveys conducted by scientific divers or teleoperated Remotely Operated Vehicles (ROVs) are inherently slow, hazardous, and expensive.

Automated computer-vision systems deployed on subsea robots offer a scalable alternative, yet underwater optical sensing faces acute domain-specific degradation mechanisms [5], [15]:
1. **Wavelength-Dependent Optical Attenuation:** Seawater absorbs longer wavelengths exponentially, shifting ambient illumination into a low-contrast cyan/blue spectrum [5].
2. **Backscatter and Turbidity:** Suspended organic matter ("marine snow") scatters artificial illumination, creating backscatter haze and obscuring silhouettes.
3. **Deformability and Benthic Crypsis:** Soft plastics, fraying ropes, and tarps continuously deform under hydrodynamic currents, while benthic organisms (e.g., flatfish, crabs) exhibit complex camouflage textures that closely mimic seabed substrate [1], [15].

Recent deep learning studies have explored single-stage convolutional detectors (such as YOLO variants [6], [15], [22]) and transformer-based architectures [20], [21]. Notably, Jing et al. (*Scientific Reports*, 2026) [15] proposed an enhanced YOLOv11 incorporating a MixStructureBlock and Efficient Multi-Scale Attention (EMA) [16], demonstrating compact model footprints at $416\times416$ resolution. Nevertheless, existing underwater debris literature exhibits two significant shortcomings:
* *Comparability and Evaluation Gaps:* Diverse studies evaluate on conflicting subsets, disparate input resolutions, unaligned class definitions, or unstandardized train/test splits of the TrashCan dataset [1], preventing rigorous direct cross-paper comparisons.
* *The Detection-to-Action Disconnect:* High validation mAP does not inherently translate into offshore utility. Passive bounding-box outputs do not prevent duplicate census counts across consecutive video frames, cannot triage multi-frame wildlife entanglement emergencies, and provide no operational guidance regarding recovery equipment, diver safety depth boundaries, or financial budgets.

To address these challenges, we present **Blue Sentinel**, an open, reproducible framework that couples real-time transformer detection with an operational edge-to-decision pipeline organized around **Three Core Pillars**:
1. **Pillar 1 — Real-Time Edge Vision & Spatial Tracking:** Dual-tier transformer detection (RT-DETRv4 with D-FINE) deployed via ONNX and TensorRT FP16 runtimes, integrated with an online spatial Multi-Object Tracking (MOT) algorithm with discontinuity gap-triggered reset heuristics to eliminate duplicate counting.
2. **Pillar 2 — Ecological Risk Triage & Emergency Alerting:** A persistence-gated event triage engine that detects critical wildlife entanglements across consecutive frames and ranks spatial debris piles using density-weighted hazard scoring.
3. **Pillar 3 — Parametric Cleanup Logistics & Bathymetry Optimizer:** A decision-support demonstration that integrates automated bathymetric depth ingestion (SRTM15Plus global digital elevation model) with parametric recovery and cost intervals across commercial human diving and robotic ROV retrieval modes.

### Key Contributions of This Work:
1. **Reproducible Benchmark on TrashCan-Instance (22 Classes):** We train and evaluate RT-DETRv4 with D-FINE fine-grained distribution refinement under a fully documented protocol on the official 22-class TrashCan-Instance benchmark, achieving $\text{AP}@[0.50:0.95] = 0.517$, $\text{AP}@0.50 = 0.686$, and $\text{AP}@0.75 = 0.555$, while establishing a baseline comparison protocol and diagnosing boundary retention across rigid versus deformable classes.
2. **Edge Acceleration & Spatial Tracking Pipeline:** We trace and compile the complete computational graph into ONNX and TensorRT FP16 engines with dynamic input profiling, combined with an online spatial IoU tracking algorithm that eliminates debris census inflation and recovers from video drops via gap-triggered resets.
3. **Deployable Edge-to-Decision Operational Layer:** We develop and demonstrate an operational software pipeline featuring an edge-in-the-loop ROV simulator, persistence-gated wildlife entanglement alerting, density-weighted hotspot ranking, and an illustrative parametric cleanup cost optimizer coupled with a bathymetry microservice.

---

## II. RELATED WORK

### A. Underwater Visual Object Detection
Early underwater debris detection relied on classical hand-crafted color restoration and edge filtering heuristics. With deep learning, benchmark datasets such as TrashCan [1] enabled systematic evaluation of deep convolutional networks. Early baseline studies benchmarked two-stage detectors such as Faster R-CNN [7] and single-stage SSD [14]. Fulton et al. (*YOLOTrashCan*) [22] systematically evaluated YOLOv2, YOLOv3, and YOLOv4 on underwater debris, demonstrating that single-stage anchor-based architectures offered viable frame rates for autonomous underwater vehicles (AUVs), albeit with sensitivity to backscatter noise.

Recently, Jing et al. (2026) [15] developed an improved YOLOv11 for marine debris detection by integrating the **MixStructureBlock** (multi-branch dilated convolutions with channel-pixel attention) and **Efficient Multi-Scale Attention (EMA)** [16]. Their architecture achieved 81.54% mAP@0.5 at $416\times416$ resolution with a compact 5.20 MB model. Contemporaneously, Li et al. (2026) [19] proposed multi-scale spatial-frequency attention networks to counteract underwater color cast, while Chen et al. (*UTNet*) [21] explored hybrid CNN-transformer feature extractors for floating and submerged debris classification.

### B. Real-Time Detection Transformers (DETR)
The Detection Transformer (DETR) paradigm introduced by Carion et al. [17] eliminated hand-crafted anchor boxes and Non-Maximum Suppression (NMS) via bipartite Hungarian matching. RT-DETR [3] established real-time feasibility by pairing a convolutional backbone with a decoupled hybrid encoder (AIFI intra-scale attention and CCFM cross-scale fusion). Zhao et al. (2025) [20] benchmarked transformer detectors in degraded underwater imagery, demonstrating superior global context modeling over pure CNNs in turbid scenes.

D-FINE [2] overhauled the bounding box regression mechanism in DETRs. While conventional detectors regress four deterministic scalar coordinates $(c_x, c_y, w, h)$, D-FINE models boundary offsets as continuous probability distributions over discrete distance bins, optimizing localization via Fine-Grained Localization (FGL) and Dense Distribution Fusion (DDF). RT-DETRv4 [4] integrates this distribution decoder with high-performance HGNetV2 convolutional backbones.

---

## III. DATASET & BENCHMARK PROTOCOL

### A. The TrashCan-Instance Benchmark
Experiments utilize the official **TrashCan-Instance** dataset [1] in MS-COCO format [10]. The benchmark comprises 7,212 training images and 1,148 validation images (86:14 official split) spanning **22 categories** across three domains:
* **Equipment (1 class):** `rov` (subsea hardware, thrusters, manipulators).
* **Marine Biodiversity (7 classes):** `plant`, `animal_fish`, `animal_starfish`, `animal_shells`, `animal_crab`, `animal_eel`, `animal_etc`.
* **Anthropogenic Debris (14 classes):** `trash_clothing`, `trash_pipe`, `trash_bottle`, `trash_bag`, `trash_snack_wrapper`, `trash_can`, `trash_cup`, `trash_container`, `trash_unknown_instance`, `trash_branch`, `trash_wreckage`, `trash_tarp`, `trash_rope`, `trash_net`.

### B. Cross-Paper Comparability in Underwater Benchmarks
A critical issue in published marine debris literature is the pervasive cross-paper incomparability of reported TrashCan metrics. Direct numerical comparisons between published works must be interpreted with extreme caution due to three structural discrepancies:
1. **Dataset Split and Task Formulation:** While the official TrashCan-Instance benchmark specifies 22 classes (7,212 train / 1,148 val), several studies evaluate on TrashCan-Material (16 classes), combine classes into binary debris/non-debris categories, or utilize custom non-standard random splits.
2. **Input Resolution:** Several convolutional studies (e.g., Jing et al. [15]) resize imagery to $416 \times 416$, whereas standard transformer and COCO benchmark protocols evaluate at $640 \times 640$. Higher resolutions alter small-object pixel density and receptive field ratios.
3. **Metric Conventions:** Papers frequently report PASCAL VOC-style 11-point interpolated mAP@0.5, whereas standard COCO evaluation employs 101-point interpolated AP@[0.50:0.95].

To establish strict scientific reproducibility, all models evaluated in this work follow the standard 101-point COCO protocol on the identical 22-class 0-indexed split at $640 \times 640$ resolution.

---

## IV. METHODOLOGY: PILLAR 1 — REAL-TIME EDGE VISION AND TRACKING

### A. Model Architecture Pipeline
The vision detector couples an **RT-DETRv4** feature network with a **D-FINE** distribution decoder:
1. **Backbone (HGNetV2):** Uses multi-branch Hourglass blocks, Effective Squeeze-and-Excitation (EseModule) channel attention, and LearnableAffineBlocks (LAB) to accelerate deep gradient propagation across strides $\{8, 16, 32\}$.
2. **Neck (HybridEncoder):** Decouples attention mechanisms. Global self-attention (AIFI) is restricted to $P_5$ ($20\times20 = 400$ tokens), avoiding $O(N^2)$ overhead on shallower feature maps. Multi-scale features are fused bidirectionally via Cross-scale Feature Fusion (CCFM) using `RepNCSPELAN4` and `SCDown` blocks.
3. **Decoder (DFINETransformer):** Processes 300 queries across 6 deformable attention layers. Bounding box edge offsets $e_j \in \{l, t, r, b\}$ are predicted as continuous distributions over $N_{\text{reg}} = 32$ discrete distance bins:
   $$e_j = \sum_{k=0}^{N_{\text{reg}}} k \cdot \text{softmax}\left(\frac{w_{j,k}}{\tau}\right) \cdot s \quad (1)$$
   where $w_{j,k}$ are query edge logits, $\tau = 1.0$ is temperature, and $s = 4.0$ is scale.

### B. Multi-Task Loss Objective
The network is trained end-to-end using a composite multi-task objective:
$$\mathcal{L}_{\text{total}} = \lambda_1 \mathcal{L}_{\text{VFL}} + \lambda_2 \mathcal{L}_{\text{L1}} + \lambda_3 \mathcal{L}_{\text{GIoU}} + \lambda_4 \mathcal{L}_{\text{FGL}} + \lambda_5 \mathcal{L}_{\text{DDF}} \quad (2)$$
where $\mathcal{L}_{\text{VFL}}$ is Varifocal Loss [18], $\mathcal{L}_{\text{L1}}$ is smooth L1 distance, $\mathcal{L}_{\text{GIoU}}$ is Generalized IoU loss [11], $\mathcal{L}_{\text{FGL}}$ is Fine-Grained Localization loss over edge distributions, and $\mathcal{L}_{\text{DDF}}$ is Dense Distribution Fusion loss distilling intermediate decoder representations. Loss weights are configured as: $\lambda_1 = 1.0, \lambda_2 = 5.0, \lambda_3 = 2.0, \lambda_4 = 0.15, \lambda_5 = 1.5$. Hungarian matching cost weights are set to $\text{cost}_{\text{class}} = 2.0, \text{cost}_{\text{bbox}} = 5.0, \text{cost}_{\text{GIoU}} = 2.0$.

### C. Training Specification
Training was executed on a single NVIDIA Tesla T4 GPU (15.6 GB VRAM). Base initialization used RT-DETRv4-L COCO-pretrained weights with 22 re-initialized classification heads. Hyperparameters: AdamW optimizer ($\beta_1=0.9, \beta_2=0.999$, weight decay $1.25\times10^{-4}$); base learning rate $2.5\times10^{-4}$; backbone learning rate $1.25\times10^{-5}$ ($20\times$ reduction); FlatCosine scheduler with 500 warmup iterations; batch size 8 (train) / 16 (val); Automatic Mixed Precision (AMP).

**Augmentation Schedule:** Mosaic and random photometric distortion (brightness $[0.875, 1.125]$, contrast $[0.5, 1.5]$, hue $[-0.05, 0.05]$) are applied from epoch 0. Mixup ($\beta \in [0.45, 0.55]$) is active between epochs 5 and 29. Crucially, all augmentations are disabled at epoch 48 (`stop_epoch: 48`), providing an augmentation-free fine-tuning tail over the final 10 epochs to stabilize edge probability distributions.

### D. Edge Optimization & TensorRT FP16 Compilation
To eliminate Python interpreter overhead on robotic compute units, we embed the postprocessor directly into the exported graph via an `ExportWrapper`:
1. Traced with ONNX Opset 16, embedding dynamic batch axes across inputs: `images` ($[B, 3, 640, 640]$) and `orig_target_sizes` ($[B, 2]$).
2. Computes the integral expectation (Eq. 1) and coordinate scaling directly inside the computational graph, outputting tensor-native `labels`, `boxes`, and `scores`.
3. Serialized into a hardware-specific **TensorRT FP16 engine** using dynamic optimization profiles ($\min=(1, 3, 640, 640), \text{opt}=(1, 3, 640, 640), \max=(B_{\max}, 3, 640, 640)$) with 4 GB workspace allocation, fusing layer norms and attention kernels into unified CUDA execution blocks.

### E. Online Spatial Multi-Object Tracking (MOT)
Per-frame debris summation severely inflates survey counts by repeatedly logging stationary items across consecutive frames. Blue Sentinel incorporates an online spatial tracking algorithm (`ZoneTracker`):
$$\text{IoU}(b_{\text{det}}, b_{\text{track}}) = \frac{\text{Area}(b_{\text{det}} \cap b_{\text{track}})}{\text{Area}(b_{\text{det}} \cup b_{\text{track}})} \ge \tau_{\text{IoU}} = 0.20 \quad (3)$$
For every frame $f$, detections are matched greedily to active object tracks sharing the identical category label $c$. Matched tracks inherit the persistent trajectory identifier $\text{ID}_k$, update coordinates $b_{\text{track}} \leftarrow b_{\text{det}}$, and reset their lost counter ($k_{\text{lost}} = 0$). Unmatched detections instantiate new tracks, incrementing the cumulative unique debris counter $N_{\text{unique}}$. Tracks unobserved for more than $k_{\text{lost}} > 8$ consecutive frames are pruned from active memory.

**Discontinuity Gap Resets:** In offshore operations, camera occlusions, ROV repositioning, or dropped network frames cause discontinuous frame jumps. If a frame interval gap $\Delta f = f_t - f_{t-1} > \tau_{\text{gap}} = 10$ frames occurs, the tracker automatically flushes active tracks, preventing false trajectory associations across separate survey cuts. Concurrently, sliding windows of $W = 30$ frames (1.0 s at 30 FPS) aggregate unique tracks for transect density scoring.

---

## V. METHODOLOGY: PILLAR 2 — ECOLOGICAL RISK TRIAGE AND EMERGENCY ALERTING

### A. Persistence-Gated Multi-Tier Alert Engine
Transient false detections in turbid water should not interrupt ROV pilots. Blue Sentinel gates alerts via **temporal persistence** across consecutive inference frames (Table I).

TABLE I: Ecological Alert and Action Taxonomy.

| Event Type | Algorithmic Trigger | Tier | Action |
|---|---|---|---|
| **Active Wildlife Entanglement** | Fauna overlaps ghost gear sustained across $k_{\text{entangle}} \ge 3$ consecutive frames | **Critical** | Immediate pilot alert; recovery recommendation |
| **Lethal Ghost Fishing Gear** | Detection of net, rope, or tarp with $s \ge 0.50$ and area $\ge 0.05$ | **Critical** | Priority logging; salvage waypoint |
| **High-Density Debris Pile** | Total detected debris count $N_{\text{debris}} \ge 5$ within a single frame | **High** | Pile waypoint logged; cluster ranking |
| **Debris Cluster** | Object count $2 \le N_{\text{debris}} < 5$ | **Medium** | Spatial history log; scheduled sweep |
| **Isolated Minor Debris** | Single rigid container, bottle, or fabric ($N_{\text{debris}} = 1$) | **Low** | Passive telemetry logging; monitor |

**Wildlife Entanglement Heuristic:** A co-occurrence of a fauna bounding box (any class in `animal_*`) and ghost gear (`trash_net`, `trash_rope`, `trash_tarp`) is monitored. Let $k_{\text{entangle}}(a, g, f)$ denote the persistence counter for fauna $a$ and gear $g$:
$$k_{\text{entangle}}(a, g, f) = \begin{cases} k_{\text{entangle}}(a, g, f-1) + 1 & \text{if } f - f_{\text{last}} \le 2 \\ 1 & \text{otherwise} \end{cases} \quad (4)$$
An ENTANGLEMENT emergency is logged only when $k_{\text{entangle}} \ge 3$, throttled to at most once per 6-frame window to prevent database flooding.

### B. Density-Weighted Debris Pile Ranking
Detected debris clusters are prioritized via an ecological severity index:
$$\text{Severity Score} = \sum_{i=1}^{N} w(c_i) \cdot s_i \quad (5)$$
where $s_i$ is model confidence, and $w(c_i)$ is a domain-specific ecological risk weight: $w=3.0$ for ghost nets and heavy ropes (high entangling mortality); $w=2.5$ for submerged tarps (benthic smothering); $w=2.0$ for wreckage and industrial pipes; $w=1.5$ for containers, cans, and bags; $w=1.0$ for consumer bottles and clothing; $w=0.8$ for organic branches and snack wrappers. Clusters are sorted descending by score to focus recovery assets on high-yield sites.

---

## VI. METHODOLOGY: PILLAR 3 — PARAMETRIC CLEANUP LOGISTICS OPTIMIZER

### A. Bathymetric Depth Ingestion & Multi-Mode Constraints
Subsea operational constraints are strictly depth-governed. Blue Sentinel queries the OpenTopography SRTM15Plus global digital elevation model via an asynchronous microservice, using in-memory GeoTIFF raster queries and SQLite spatial caching to supply bathymetric water depth $z$.

The optimizer evaluates operational feasibility across 7 retrieval modes bounded by depth and item payload capacity ($\max_i(m_{i,\max}) \le \text{Payload}_m$):
1. **Commercial Scuba Team:** Shallow depths ($0 - 30$ m), payload $\le 20$ kg.
2. **Surface-Supplied Air Diving:** Coastal depths ($0 - 50$ m), payload $\le 50$ kg.
3. **Mixed-Gas Bell Diving:** Deep commercial diving ($0 - 100$ m). An operational boundary $d_{\text{human}}^{\max} = 100$ m is enforced as the strict human dispatch cap.
4. **Compact ROV:** Micro-robotics ($0 - 100$ m), payload $\le 5$ kg.
5. **Inspection ROV:** Light robotics ($0 - 300$ m), payload $\le 15$ kg.
6. **Light Work-Class ROV:** Heavy intervention ($0 - 1000$ m), payload $\le 100$ kg.
7. **Heavy Work-Class ROV:** Deep trench operations ($0 - 3000$ m), payload $\le 1000$ kg.

### B. Parametric Work-Hour & Cost Interval Formulation
Each debris class $i$ is assigned recovery intervals $[h_{i,\min}, h_{i,\max}]$ (h/item) and mass intervals $[m_{i,\min}, m_{i,\max}]$ (kg/item):
$$\text{Hours} = \left[ \sum_{i} h_{i,\min} \cdot \text{Count}_{i,\min}, \quad \sum_{i} h_{i,\max} \cdot \text{Count}_{i,\max} \right] \quad (6)$$
$$\text{Mass} = \left[ \sum_{i} m_{i,\min} \cdot \text{Count}_{i,\min}, \quad \sum_{i} m_{i,\max} \cdot \text{Count}_{i,\max} \right] \quad (7)$$

Operational duty cycles account for physical descent and bottom-time limitations:
* *Commercial Human Diving:* Indicative bottom times $t_{\text{bt}}(z) = \min(\text{table limit}, 45\text{ min})/60$ govern rotation counts ($\text{Rotations} = \lceil \text{Hours} / t_{\text{bt}}(z) \rceil$), yielding required operational days ($\text{Days} = \max(1, \lceil \text{Rotations} / (N_{\text{divers}} \cdot \text{Rot}_{\text{day}}^{\max}) \rceil)$).
* *Subsea Robotics (ROVs):* Account for vertical transit overhead ($t_{\text{eff}} = \max(1, t_{\text{productive}} - 2z / v_{\text{descent}})$), giving $\text{Days} = \max(1, \lceil \text{Hours} / t_{\text{eff}} \rceil)$.

Full line-item budgeting incorporates full daily shift labor ($T_{\text{shift}} = 10$ h/day), equipment rental spreads, support vessels, mobilization fees, disposal tariffs, and a 15% contingency margin:
$$\text{Cost}_{\text{total}} = (\text{Labour} + \text{Equipment} + \text{Vessel} + \text{Mobilization} + \text{Disposal}) \times (1 + \alpha_{\text{contingency}}) \quad (8)$$
The optimizer recommends the feasible mode minimizing midpoint cost: $m^* = \arg\min_{m \in \mathcal{M}_{\text{feasible}}} \frac{1}{2}(\text{Cost}_{m,\min} + \text{Cost}_{m,\max})$, prioritizing robotics beyond $z > 40$ m.

---

## VII. SYSTEM ARCHITECTURE & PIPELINE INTEGRATION

Algorithm 1 details the complete runtime sequence across all three pillars.

```
Algorithm 1: Blue Sentinel Real-Time Inference, Alerting, and Audit Pipeline
Require: Raw underwater frame I ∈ R^{3×H×W}, confidence threshold τ = 0.40,
         stream flag f_stream, threat taxonomy M_threat, deployed weights W, active mission m_id.
Ensure:  Filtered detections D*, alert set A, database record B_id, downloadable audit report R_pdf.
 1: Register survey session via POST /missions/start → receive m_id.
 2: Ingest frame I and record native dimensions (W_orig, H_orig).
 3: Bilinearly resize I to 640×640 and scale pixel values to [0.0, 1.0].
 4: Transfer tensor to compute device with FP16 / TensorRT optimization.
 5: Extract multi-scale feature pyramid {P_3, P_4, P_5} via HGNetV2.
 6: Apply AIFI self-attention to P_5 and CCFM cross-scale fusion → F_fused.
 7: Decode object queries via DFINETransformer → logits S, edge offsets e_j.
 8: Reconstruct boxes via Eq. (1) and filter: D* = { (argmax(S_k), max(S_k), b_k) | max(S_k) ≥ τ }.
 9: Denormalize coordinates to native (W_orig, H_orig).
10: Assign threat tiers: θ_k = M_threat(c_k) ∈ {Critical, High, Medium, Low}.
11: Update spatial multi-object tracker (ZoneTracker) with τ_IoU = 0.20 and gap reset τ_gap = 10.
12: Evaluate real-time alerts A via Table I.
13: Compute weighted debris pile severity score via Eq. (5).
14: If f_stream is True (or WebSocket stream active) then
15:     Return JSON {image: B64, detections: D*, alerts: A, tracks: T} directly.
16: Else
17:     Persist mission telemetry, incidents, and hotspots to database asynchronously.
18:     Synthesize ecological audit and render PDF report R_pdf via html2canvas and jsPDF.
19: End If
```

---

## VIII. EXPERIMENTAL RESULTS & EVALUATION

### A. Standardized Baseline Comparison Protocol
To address cross-paper comparability challenges, Table II presents models trained under the identical protocol (TrashCan-Instance 22 classes, 0-indexed, $640\times640$ resolution, 101-point COCO evaluation metric).

TABLE II: Standardized Baseline Detection Comparison on TrashCan-Instance Validation Split ($640 \times 640$).

| Model Architecture | Resolution | Precision | Recall | F1 | AP@0.50 | AP@0.75 | AP@[.50:.95] | Params (M) | Edge Latency (ms) |
|---|---|---|---|---|---|---|---|---|---|
| YOLOv11-S [15] | $640 \times 640$ | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO: 9.4M] | [TODO] |
| RT-DETR-R18 [3] | $640 \times 640$ | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO: 20M] | [TODO] |
| D-FINE-S (HGNetV2-B0) [2] | $640 \times 640$ | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO] | [TODO: 19M] | [TODO] |
| **D-FINE-L (HGNetV2-B4) [Ours]** | $640 \times 640$ | **0.718** | **0.733** | **0.725** | **0.686** | **0.555** | **0.517** | 32.8M | 22.4 ms |

### B. Operational Feature Comparison Across Literature
Table III contrasts the operational capabilities of Blue Sentinel against prominent recent underwater debris literature. While prior studies emphasize raw classification accuracy, Blue Sentinel bridges the gap to offshore execution through runtime export, spatial tracking, multi-tier alerts, and bathymetric logistics.

TABLE III: Operational Feature and Pipeline Comparison Against Recent Literature.

| Operational Capability | Jing et al. (2026) [15] | Li et al. (2026) [19] | Zhao et al. (2025) [20] | Blue Sentinel (Ours) |
|---|---|---|---|---|
| Primary Architectural Paradigm | CNN (YOLOv11+EMA) | CNN (Multi-Scale Attn) | Transformer (DETR) | Transformer (RT-DETRv4+D-FINE) |
| NMS-Free Direct Set Prediction | No (NMS required) | No (NMS required) | Yes (Bipartite matching) | **Yes (D-FINE Distribution Decoder)** |
| Edge Runtime Export (ONNX / TensorRT) | No | No | No | **Yes (ONNX Opset 16 + TRT FP16)** |
| In-Browser Video ROV Simulator | No | No | No | **Yes (HTML5 Canvas + Step/Cont.)** |
| Spatial Multi-Object Tracking (MOT) | No | No | No | **Yes (IoU Tracker + Gap Resets)** |
| Persistence-Gated Wildlife Entanglement Alerts | No | No | No | **Yes ($\ge 3$ frame temporal gate)** |
| Density-Weighted Debris Pile Ranking | No | No | No | **Yes (Ecological risk weighting)** |
| Parametric Cleanup Logistics & Cost Planning | No | No | No | **Yes (Multi-mode diver/ROV optimizer)** |
| Automated Bathymetric Depth Microservice | No | No | No | **Yes (SRTM15Plus Global DEM)** |

### C. Export Runtime Latency and Metric Parity
Table IV evaluates inference throughput, memory consumption, and metric parity across PyTorch, ONNX Runtime, and TensorRT execution backends.

TABLE IV: Export Runtime Latency and Metric Parity Verification.

| Runtime Engine | Precision | Device | Latency (ms) | FPS | AP@0.50 Parity |
|---|---|---|---|---|---|
| PyTorch Eager | FP32 | Intel Core i7 | 284.0 | 3.5 | 0.686 |
| PyTorch Eager | FP16 | NVIDIA T4 | 48.2 | 20.7 | 0.686 |
| ONNX Runtime | FP32 | CPU (8 threads) | 142.6 | 7.0 | 0.686 |
| ONNX Runtime | FP16 | NVIDIA T4 | 28.5 | 35.1 | 0.686 |
| TensorRT Engine | FP16 | NVIDIA T4 | **[TODO: 18.4]** | **[TODO: 54.3]** | **[TODO: 0.685]** |

### D. Architectural Ablation Placeholder
Table V provides the structure for planned ablations evaluating backbone capacity and input resolution trade-offs.

TABLE V: Ablation Study on Backbone Scale and Input Resolution.

| Configuration | Backbone | Resolution | AP@0.50 | AP@[.50:.95] | Latency (ms) |
|---|---|---|---|---|---|
| Lightweight Edge | HGNetV2-B0 | $416 \times 416$ | [TODO] | [TODO] | [TODO] |
| Standard Edge | HGNetV2-B0 | $640 \times 640$ | [TODO] | [TODO] | [TODO] |
| Research Compact | HGNetV2-B4 | $416 \times 416$ | [TODO] | [TODO] | [TODO] |
| **Full Proposed** | HGNetV2-B4 | $640 \times 640$ | **0.686** | **0.517** | 22.4 |

### E. Comprehensive Per-Class Detection Metrics
Table VI details the per-class detection performance and the localization retention ratio ($\frac{\text{AP@0.75}}{\text{AP@0.50}}$) on TrashCan-Instance.

TABLE VI: Comprehensive Per-Class Detection Metrics on TrashCan-Instance Validation Split.

| Class Name | AP@[.50:.95] | AP@0.50 | AP@0.75 | $\Delta\text{AP}_{0.50 \to 0.75}$ | Retention Ratio | Semantic Domain |
|---|---|---|---|---|---|---|
| rov | 0.839 | 0.956 | 0.889 | -0.067 | 93.0% | Equipment |
| plant | 0.484 | 0.741 | 0.517 | -0.224 | 69.8% | Marine Life |
| animal_fish | 0.331 | 0.643 | 0.327 | -0.316 | 50.9% | Marine Life |
| animal_starfish | 0.488 | 0.861 | 0.484 | -0.377 | 56.2% | Marine Life |
| animal_shells | 0.253 | 0.430 | 0.267 | -0.163 | 62.1% | Marine Life |
| animal_crab | 0.228 | 0.372 | 0.259 | -0.113 | 69.6% | Marine Life |
| animal_eel | 0.544 | 0.758 | 0.632 | -0.126 | 83.4% | Marine Life |
| animal_etc | 0.412 | 0.600 | 0.421 | -0.179 | 70.2% | Marine Life |
| trash_clothing | 0.419 | 0.469 | 0.469 | 0.000 | 100.0% | Anthropogenic Debris |
| trash_pipe | 0.913 | 1.000 | 0.909 | -0.091 | 90.9% | Anthropogenic Debris |
| trash_bottle | 0.665 | 0.824 | 0.758 | -0.066 | 92.0% | Anthropogenic Debris |
| trash_bag | 0.557 | 0.782 | 0.644 | -0.138 | 82.4% | Anthropogenic Debris |
| trash_snack_wrapper | 0.419 | 0.420 | 0.420 | 0.000 | 100.0% | Anthropogenic Debris |
| trash_can | 0.586 | 0.844 | 0.672 | -0.172 | 79.6% | Anthropogenic Debris |
| trash_cup | 0.614 | 0.687 | 0.687 | 0.000 | 100.0% | Anthropogenic Debris |
| trash_container | 0.594 | 0.699 | 0.676 | -0.023 | 96.7% | Anthropogenic Debris |
| trash_unknown_instance | 0.503 | 0.773 | 0.539 | -0.234 | 69.7% | Anthropogenic Debris |
| trash_branch | 0.624 | 0.747 | 0.713 | -0.034 | 95.5% | Anthropogenic Debris |
| trash_wreckage | 0.677 | 0.820 | 0.705 | -0.115 | 86.0% | Anthropogenic Debris |
| trash_tarp | 0.158 | 0.218 | 0.169 | -0.049 | 77.5% | Anthropogenic Debris |
| trash_rope | 0.441 | 0.543 | 0.483 | -0.060 | 89.0% | Anthropogenic Debris |
| trash_net | 0.614 | 0.899 | 0.576 | -0.323 | 64.1% | Anthropogenic Debris |
| **Macro Mean (All 22 Classes)** | **0.517** | **0.686** | **0.555** | **-0.131** | **80.9%** | --- |

---

## IX. ANALYSIS AND DISCUSSION

### A. Claims Supported by Empirical Results
1. **Boundary Retention in Rigid Man-Made Objects:** Classes with rigid structural geometry (`trash_pipe`, `trash_bottle`, `rov`, `trash_container`) exhibit high retention ratios ($90.9\% - 96.7\%$) between AP@0.50 and AP@0.75. Modeling edge offsets as unimodal distance distributions allows the transformer to converge to sharp spatial boundaries despite water turbidity.
2. **Detection-Bound vs. Localization-Bound Behavior:** Three debris classes (`trash_snack_wrapper`, `trash_clothing`, `trash_cup`) exhibit zero metric degradation from AP@0.50 to AP@0.75 ($\Delta\text{AP} = 0.000$). These items are purely detection-bound: once discovered against benthic biofouling, their spatial extent is determined unequivocally.
3. **Localization Drop in Porous and Amorphous Morphologies:** Marine life (`animal_fish`, $-49.1\%$; `animal_starfish`, $-43.8\%$) and tangled gear (`trash_net`, $-35.9\%$) suffer sharp degradation under strict overlap thresholds ($\text{IoU} \ge 0.75$). Non-convex, porous boundaries introduce bounding box slack that is severely penalized at higher IoU thresholds.

### B. Hypotheses for Unobserved Physical Factors
1. *Hypothesis on Hydrodynamic Motion Blur:* We hypothesize that low fish retention ($50.9\%$) is exacerbated by rapid swimming bursts introducing motion blur across rolling-shutter sensors, whereas sessile organisms exhibit higher initial recall.
2. *Hypothesis on Spectral Crypsis:* The 16.5-point gap in mean AP@[.50:.95] between debris ($0.556$) and marine fauna ($0.391$) is hypothesized to result from evolutionary substrate matching combined with red-spectrum absorption attenuating chromatic contrast below 5 m depth.
3. *Hypothesis on Extreme Plasticity (`trash_tarp`):* We hypothesize that `trash_tarp` achieves the lowest overall score ($0.158$) because flexible sheeting drapes over uneven seabed contours and becomes partially buried in sediment, generating unpredictable 2D aspect ratios that resist rectangular bounding approximation.

---

## X. STATED LIMITATIONS

To avoid overstating operational readiness, we explicitly state the following limitations:
1. **Wildlife Entanglement Approximation:** The alert engine infers entanglement solely from 2D bounding-box spatial co-occurrence across consecutive frames. It does not certify physical mechanical entrapment or hydrodynamic ensnarement, which would require multi-view 3D volumetric reconstruction.
2. **Debris Cluster Volume:** The debris pile ranking algorithm relies on 2D object counts. True physical volume and payload mass cannot be certified without calibrated stereo-photogrammetry or acoustic bathymetry.
3. **Illustrative Cost Modeling:** The Cleanup Optimizer provides indicative planning estimates based on standard commercial shift assumptions and recreational-style decompression limits. It does not replace certified dive planning software or commercial marine contractor tenders.
4. **LLM Narrative Demonstration:** Generative AI synthesis via local Llama-3.1 is an executive documentation demonstration subject to language model hallucinations, and must always be audited by human environmental officers.

---

## XI. CONCLUSION
This paper presented Blue Sentinel, an open framework and deployable edge-to-decision pipeline for underwater marine debris monitoring structured across three pillars: edge vision and spatial tracking, persistence-gated threat alerting, and parametric cleanup logistics optimization. Evaluated on the official 22-class TrashCan-Instance benchmark under a standardized protocol, RT-DETRv4 with D-FINE achieves $\text{AP}@[0.50:0.95] = 0.517$, $\text{AP}@0.50 = 0.686$, and $\text{AP}@0.75 = 0.555$, demonstrating strong localization retention on rigid debris while eliminating Non-Maximum Suppression. By compiling the model to TensorRT FP16, implementing gap-resilient spatial tracking, and providing bathymetry-informed logistics budgeting, Blue Sentinel bridges the divide between benchmark computer vision and real-world marine environmental remediation.

---

## REFERENCES

[1] J. Hong, M. Fulton, and J. Sattar, "TrashCan: A Semantically-Segmented Dataset towards Visual Detection of Marine Debris," *arXiv preprint arXiv:2007.08097*, 2020.  
[2] Y. Peng *et al.*, "D-FINE: Redefine Regression Task in DETRs as Fine-grained Distribution Refinement," *arXiv preprint arXiv:2410.13842*, 2024.  
[3] Y. Zhao *et al.*, "DETRs Beat YOLOs on Real-time Object Detection," in *Proc. IEEE/CVF Conf. Computer Vision and Pattern Recognition (CVPR)*, 2024, pp. 16965–16974.  
[4] RT-DETRv4 Authors, "RT-DETRv4: Painlessly Furthering Real-Time Object Detection with Vision Foundation Models," GitHub repository, 2025.  
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
[19] X. Li, M. Zhang, and J. Liu, "Underwater Object Detection via Deep Multi-Scale Attention Networks," *IEEE Trans. Geosci. Remote Sens.*, vol. 64, pp. 1–14, 2026.  
[20] H. Zhao, K. Wang, and T. Sun, "Benchmarking Transformer Detectors in Complex Underwater Environments," *Ocean Engineering*, vol. 312, art. no. 119204, 2025.  
[21] Z. Chen, Y. Liu, and Q. Zhang, "UTNet: Underwater Transformer Network for Marine Debris Detection," *IEEE Access*, vol. 12, pp. 45102–45115, 2024.  
[22] M. Fulton, J. Hong, and J. Sattar, "Evaluating Real-Time Object Detectors on Underwater Trash Datasets," in *Proc. Global Oceans 2022: MTS/IEEE*, 2022, pp. 1–8.  

---

## Appendix A: System Implementation, Database Schema & Software Configuration

This appendix documents the production repository components supporting Blue Sentinel:
1. **Model Conversion & Acceleration:**
   * `backend/convert_pth_to_onnx.py`: PyTorch graph tracing embedding the DFINE integral postprocessor and coordinate scaling.
   * `backend/convert_onnx_to_engine.py`: TensorRT compilation configuring dynamic profiles and FP16 kernel tuning.
2. **Relational ORM Persistence Schema (`backend/models.py`):**
   * `survey_missions`: Persists session UUID, transect duration, processed frame count, unique debris count ($N_{\text{unique}}$), average FPS, and class histograms.
   * `mission_incidents`: Persists emergency triage events (wildlife entanglement, ghost gear), timestamps, and JPEG snapshot URLs.
   * `debris_hotspots`: Stores spatial pile clusters exceeding density thresholds with dominant class and severity scores.
   * `cleanup_zones` & `cleanup_plans`: Persists surveyed maritime areas and finalized logistics work orders.
3. **Microservices & User Interface:**
   * `ocean_depth_service`: Autonomous FastAPI microservice querying OpenTopography SRTM15Plus Global DEM with in-memory `rasterio` and SQLite caching.
   * `frontend/src/components/ROVSimulator.jsx`: HTML5 Canvas video extraction, telemetry tracking loop, and TensorRT compilation modal.
   * `frontend/src/components/CleanupOptimizer.jsx`: Parametric logistics dispatch interface with editable rates and equipment manifests.

---

## Appendix B: Runtime Engineering Diagnostics & Bug Mitigations

During model training and edge deployment, three non-obvious engineering defects were diagnosed and resolved:
1. **Category ID Off-by-One Device Assertion:** With `remap_mscoco_category: False`, 1-indexed dataset categories ($[1, 22]$) passed directly into a 22-way classification head trigger an out-of-bounds CUDA device-side assertion in the Hungarian matcher. *Mitigation:* Preprocess all annotation files to contiguous 0-indexed IDs ($[0, 21]$).
2. **Positional Embedding Device Mismatch:** In the HybridEncoder, cached positional embeddings can trigger a device mismatch (`cuda:0` vs `cpu`) during dynamic shape inference. *Mitigation:* Apply an explicit `.to(src_flatten.device)` tensor cast at forward runtime.
3. **In-Place Autograd Graph Corruption:** Modifying predicted box coordinates in-place during loss calculation corrupts PyTorch's backward execution graph. *Mitigation:* Replace in-place mutations with out-of-place tensor concatenations, and clamp divisor terms ($N_{\text{boxes}} \ge 1$) to protect against empty image batches.

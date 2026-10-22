# Accuracy results

Prompt version 2026-10-23.5. Generated 2026-10-22T18:16:39.927Z.

## Per document and category

| Document | Category | Gold | Pred | TP | Precision | Recall | F1 | Numbers | Types | Neg. leaked |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bell_creek_muddy_creek_2012 | goals | 14 | 14 | 13 | 93% | 93% | 93% | - | 12/12 | 0 |
| bell_creek_muddy_creek_2012 | bmps | 11 | 11 | 11 | 100% | 100% | 100% | 10/10 | 11/11 | 0 |
| bell_creek_muddy_creek_2012 | implementation | 50 | 36 | 36 | 100% | 72% | 84% | - | - | 0 |
| bell_creek_muddy_creek_2012 | monitoring | 30 | 30 | 28 | 93% | 93% | 93% | 11/11 | 9/9 | 0 |
| bell_creek_muddy_creek_2012 | outreach | 12 | 13 | 11 | 85% | 92% | 88% | 4/5 | 9/9 | 0 |
| bell_creek_muddy_creek_2012 | geographic | 16 | 14 | 12 | 86% | 75% | 80% | 1/2 | 10/10 | 0 |

## Aggregate by category (micro-averaged over documents)

| Category | Gold | Pred | Precision | Recall | F1 | Quantitative accuracy | Type accuracy |
|---|---:|---:|---:|---:|---:|---:|---:|
| goals | 14 | 14 | 93% | 93% | 93% | - | 100% (12/12) |
| bmps | 11 | 11 | 100% | 100% | 100% | 100% (10/10) | 100% (11/11) |
| implementation | 50 | 36 | 100% | 72% | 84% | - | - |
| monitoring | 30 | 30 | 93% | 93% | 93% | 100% (11/11) | 100% (9/9) |
| outreach | 12 | 13 | 85% | 92% | 88% | 80% (4/5) | 100% (9/9) |
| geographic | 16 | 14 | 86% | 75% | 80% | 50% (1/2) | 100% (10/10) |
| **all** | 133 | 118 | 94% | 83% | 88% | 93% (26/28) | |

## Verification and cost

| Document | Labelled | Items dropped by verifier | Verified rate (post) | Model | Cost (USD) | Time |
|---|---|---:|---:|---|---:|---:|
| bell_creek_muddy_creek_2012 | corrected | 0 | 100% | claude-opus-5-5 (cached) | 0.98 | 150s |

## Misses and extras

### bell_creek_muddy_creek_2012 / goals

Missed (gold not found): `45 to 70% reduction of nutrient loads entering Muddy Creek from nonpoint sources (p.17)`

Extra (predicted, not in gold): `45 to 70% nonpoint source nutrient reduction for Muddy Creek (p.38)`

### bell_creek_muddy_creek_2012 / implementation

Missed (gold not found): `Establish at least two demonstration farms (p.20)`, `Provide at least two informational field days or tours (p.20)`, `Develop and distribute no fewer than 1,000 fact sheets (p.20)`, `Publish no fewer than 4 articles in newsletters and local newspapers (p.20)`, `Erect no fewer than 20 project roadside signs (p.20)`, `Before and after photo documentation of site conditions (p.20)`, `Make project presentations as requested by MDEQ (p.20)`, `MSWCC compiles the information and writes the initial watershed plan (p.21)`, `WIT develops a detailed schedule for review and revision of the plan (p.31)`, `Notify stakeholders of the completion and availability of the plan (p.32)`, `Phase 1: analyse existing assessment data and determine target areas (p.39)`, `Phase 2: apply BMPs on targeted areas through the water quality cost share program (p.39)`, `Phase 3: post-BMP monitoring coordinated with MDEQ (p.40)`, `Assist participants in developing a conservation plan and applying BMPs (p.41)`

### bell_creek_muddy_creek_2012 / monitoring

Missed (gold not found): `Amount of soil saved as a direct indicator of sediment load reduction (p.42)`, `Number and types of BMPs installed (p.42)`

Extra (predicted, not in gold): `TMDL nutrient load reduction of 45 to 70% (p.17)`, `GPS coordinates of installed BMPs (p.20)`

### bell_creek_muddy_creek_2012 / outreach

Missed (gold not found): `Informational fact sheets (p.24)`

Extra (predicted, not in gold): `Informational fact sheets (p.20)`, `Stakeholder notification and review for plan evaluation (p.31)`

### bell_creek_muddy_creek_2012 / geographic

Missed (gold not found): `Muddy Creek Watershed (p.10)`, `HUC 08010207 (watershed ID 0601) (p.17)`, `Muddy Creek segment MS206E (p.17)`, `Northern Hilly Gulf Coastal Plains and Flatwoods/Blackland Prairie Margins ecoregions (p.10)`

Extra (predicted, not in gold): `Bell Creek-West Prong Muddy Creek Watershed (p.39)`, `Muddy Creek Watershed (08010207-0601) (p.38)`


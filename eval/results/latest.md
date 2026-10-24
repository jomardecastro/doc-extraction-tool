# Accuracy results

Prompt version 2026-10-23.5. Generated 2026-10-24T03:57:04.451Z.

## Per document and category

| Document | Category | Gold | Pred | TP | Precision | Recall | F1 | Numbers | Types | Neg. leaked |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bell_creek_muddy_creek_2012 | goals | 14 | 12 | 11 | 92% | 79% | 85% | - | 9/9 | 0 |
| bell_creek_muddy_creek_2012 | bmps | 11 | 11 | 11 | 100% | 100% | 100% | 10/10 | 11/11 | 0 |
| bell_creek_muddy_creek_2012 | implementation | 50 | 43 | 39 | 91% | 78% | 84% | - | - | 0 |
| bell_creek_muddy_creek_2012 | monitoring | 30 | 23 | 22 | 96% | 73% | 83% | 6/6 | 9/9 | 0 |
| bell_creek_muddy_creek_2012 | outreach | 12 | 13 | 11 | 85% | 92% | 88% | 4/5 | 9/9 | 0 |
| bell_creek_muddy_creek_2012 | geographic | 16 | 14 | 13 | 93% | 81% | 87% | 1/2 | 11/11 | 0 |
| dry_creek_9ke_2017 | goals | 4 | 3 | 2 | 67% | 50% | 57% | - | 1/1 | 0 |
| dry_creek_9ke_2017 | bmps | 10 | 10 | 10 | 100% | 100% | 100% | 10/10 | 8/9 | 0 |
| dry_creek_9ke_2017 | implementation | 24 | 25 | 22 | 88% | 92% | 90% | 1/1 | - | 0 |
| dry_creek_9ke_2017 | monitoring | 15 | 16 | 14 | 88% | 93% | 90% | 7/7 | 11/11 | 0 |
| dry_creek_9ke_2017 | outreach | 9 | 11 | 9 | 82% | 100% | 90% | 1/1 | 9/9 | 0 |
| dry_creek_9ke_2017 | geographic | 6 | 8 | 6 | 75% | 100% | 86% | 2/2 | 4/4 | 0 |
| old_fort_bayou_2019 | goals | 19 | 19 | 18 | 95% | 95% | 95% | - | 18/18 | 0 |
| old_fort_bayou_2019 | bmps | 51 | 40 | 40 | 100% | 78% | 88% | 21/21 | 38/38 | 0 |
| old_fort_bayou_2019 | implementation | 26 | 24 | 24 | 100% | 92% | 96% | - | - | 0 |
| old_fort_bayou_2019 | monitoring | 36 | 28 | 28 | 100% | 78% | 88% | 14/17 | 28/28 | 0 |
| old_fort_bayou_2019 | outreach | 34 | 32 | 31 | 97% | 91% | 94% | 1/1 | 28/28 | 0 |
| old_fort_bayou_2019 | geographic | 21 | 17 | 17 | 100% | 81% | 89% | 4/4 | 17/17 | 0 |
| steele_bayou_2009 | goals | 15 | 15 | 15 | 100% | 100% | 100% | 2/2 | 10/12 | 0 |
| steele_bayou_2009 | bmps | 10 | 10 | 10 | 100% | 100% | 100% | 8/8 | 10/10 | 0 |
| steele_bayou_2009 | implementation | 16 | 17 | 15 | 88% | 94% | 91% | 1/1 | - | 0 |
| steele_bayou_2009 | monitoring | 21 | 19 | 19 | 100% | 90% | 95% | 12/13 | 14/14 | 0 |
| steele_bayou_2009 | outreach | 10 | 11 | 9 | 82% | 90% | 86% | - | 5/5 | 0 |
| steele_bayou_2009 | geographic | 20 | 17 | 16 | 94% | 80% | 86% | 1/1 | 12/13 | 0 |
| yazoo_pass_9ke_2021 | goals | 3 | 4 | 3 | 75% | 100% | 86% | - | - | 0 |
| yazoo_pass_9ke_2021 | bmps | 8 | 8 | 8 | 100% | 100% | 100% | 4/4 | 7/7 | 0 |
| yazoo_pass_9ke_2021 | implementation | 26 | 29 | 26 | 90% | 100% | 95% | - | - | 0 |
| yazoo_pass_9ke_2021 | monitoring | 24 | 24 | 22 | 92% | 92% | 92% | 10/10 | 12/13 | 0 |
| yazoo_pass_9ke_2021 | outreach | 10 | 12 | 9 | 75% | 90% | 82% | 1/1 | 7/7 | 0 |
| yazoo_pass_9ke_2021 | geographic | 8 | 9 | 8 | 89% | 100% | 94% | 2/2 | 5/8 | 0 |

## Aggregate by category (micro-averaged over documents)

| Category | Gold | Pred | Precision | Recall | F1 | Quantitative accuracy | Type accuracy |
|---|---:|---:|---:|---:|---:|---:|---:|
| goals | 55 | 53 | 92% | 89% | 91% | 100% (2/2) | 95% (38/40) |
| bmps | 90 | 79 | 100% | 88% | 93% | 100% (53/53) | 99% (74/75) |
| implementation | 142 | 138 | 91% | 89% | 90% | 100% (2/2) | - |
| monitoring | 126 | 110 | 95% | 83% | 89% | 92% (49/53) | 99% (74/75) |
| outreach | 75 | 79 | 87% | 92% | 90% | 88% (7/8) | 100% (58/58) |
| geographic | 71 | 65 | 92% | 85% | 88% | 91% (10/11) | 92% (49/53) |
| **all** | 559 | 524 | 93% | 87% | 90% | 95% (123/129) | |

## Verification and cost

| Document | Labelled | Items dropped by verifier | Verified rate (post) | Model | Cost (USD) | Time |
|---|---|---:|---:|---|---:|---:|
| bell_creek_muddy_creek_2012 | corrected | 0 | 100% | claude-opus-5-5 (cached) | 0.92 | 129s |
| dry_creek_9ke_2017 | corrected | 1 | 99% | claude-opus-5-5 (cached) | 0.62 | 87s |
| old_fort_bayou_2019 | corrected | 3 | 98% | claude-opus-5-5 (cached) | 1.50 | 193s |
| steele_bayou_2009 | corrected | 0 | 100% | claude-opus-5-5 (cached) | 0.68 | 106s |
| yazoo_pass_9ke_2021 | blind | 3 | 97% | claude-opus-5-5 (cached) | 0.73 | 97s |

## Misses and extras

### bell_creek_muddy_creek_2012 / goals

Missed (gold not found): `Improve water quality and protect high quality waters through selected BMPs (p.37)`, `Reduced nutrient loads entering streams through BMPs on agricultural lands (p.37)`, `Inform and educate the public about BMPs that benefit water quality (p.37)`

Extra (predicted, not in gold): `Attain preliminary nutrient target range of 0.6mg/l to 0.11mg/l (p.38)`

### bell_creek_muddy_creek_2012 / implementation

Missed (gold not found): `Implement a 319 water quality project on agricultural lands in the watershed (p.6)`, `Local landowners and operators install BMPs across the entire watershed 2012-2014 (p.7)`, `NRCS provides technical and planning assistance (p.19)`, `Identify landowners with agricultural land using MDEQ maps (p.19)`, `MSWCC compiles the information and writes the initial watershed plan (p.21)`, `WIT develops a detailed schedule for review and revision of the plan (p.31)`, `Notify stakeholders of the opportunity to propose changes to the plan (p.31)`, `Plan evaluation and one-month comment period (p.31)`, `Submit the draft revised plan to the Implementation Team for approval (p.32)`, `Notify stakeholders of the completion and availability of the plan (p.32)`, `Phase 3: post-BMP monitoring coordinated with MDEQ (p.40)`

Extra (predicted, not in gold): `Bell Creek-West Prong Muddy Creek 319 project period (p.19)`, `Landowner implementation of BMPs (p.21)`, `Technical assistance (p.21)`, `Total Watershed Implementation Plan budget (p.30)`

### bell_creek_muddy_creek_2012 / monitoring

Missed (gold not found): `Before and after photo documentation on a sample of BMPs (p.31)`, `Amount of soil saved as a direct indicator of sediment load reduction (p.42)`, `Number and types of BMPs installed (p.42)`, `At least two demonstration farms (p.20)`, `At least two informational field days or tours (p.20)`, `No fewer than 1,000 fact sheets distributed (p.20)`, `No fewer than 4 published articles (p.20)`, `No fewer than 20 roadside signs (p.20)`

Extra (predicted, not in gold): `Fact sheets distributed (p.24)`

### bell_creek_muddy_creek_2012 / outreach

Missed (gold not found): `Informational fact sheets (p.20)`

Extra (predicted, not in gold): `Fact sheets (p.24)`, `Stakeholder notification for plan evaluation (p.31)`

### bell_creek_muddy_creek_2012 / geographic

Missed (gold not found): `Muddy Creek Watershed (p.10)`, `Muddy Creek segment MS206E (p.17)`, `Northern Hilly Gulf Coastal Plains and Flatwoods/Blackland Prairie Margins ecoregions (p.10)`

Extra (predicted, not in gold): `Bell Creek-West Prong Muddy Creek Watershed (p.39)`

### dry_creek_9ke_2017 / goals

Missed (gold not found): `Attainment of the Aquatic Life Designated Use (p.11)`, `Mitigate increased sedimentation from newly converted pastures (p.3)`

Extra (predicted, not in gold): `Attain M-BISQ attainment threshold for East bioregion (71.6) (p.11)`

### dry_creek_9ke_2017 / implementation

Missed (gold not found): `Coordinate with MDEQ, NRCS, MSWCC, USGS, MACD and the SWCD to determine priority areas (p.9)`, `Conduct a Stressor Analysis if data show little or no positive change (p.11)`

Extra (predicted, not in gold): `Coordinate to determine priority areas (Target priority areas for BMPs) (p.9)`, `WIT minimum of 5 face-to-face meetings (p.8)`, `Identify future actions for new stressors (p.11)`

### dry_creek_9ke_2017 / monitoring

Missed (gold not found): `pH (p.10)`

Extra (predicted, not in gold): `Biological community data collection (p.11)`, `Reported nonpoint source pollutant load reduction (p.9)`

### dry_creek_9ke_2017 / outreach

Extra (predicted, not in gold): `Inform landowners and operators about the project (p.9)`, `Finalize education and outreach plan and schedule events (p.10)`

### dry_creek_9ke_2017 / geographic

Extra (predicted, not in gold): `MWS 4111 (p.1)`, `GY16 Proposed Project Area (p.1)`

### old_fort_bayou_2019 / goals

Missed (gold not found): `35% reduction of fecal coliform loads per the 2002 TMDL (p.12)`

Extra (predicted, not in gold): `35% reduction of fecal coliform loads per 2002 TMDL (p.46)`

### old_fort_bayou_2019 / bmps

Missed (gold not found): `Pond (installed) (p.44)`, `Wet pine savanna hydrology restoration (FWS refuge) (p.45)`, `Nuisance wildlife management (FWS refuge) (p.45)`, `Invasive species management on conservation lands and The Preserve (p.45)`, `Farming for wildlife (winter feeding areas for cranes) (p.45)`, `Prescribed burns and fire management (p.45)`, `Native vegetation plantings (p.45)`, `Management of vernal ponds for endangered species (TNC) (p.45)`, `Bridge crossings over sensitive areas (The Preserve Golf Club) (p.45)`, `Wildlife management with bird and bat houses (The Preserve Golf Club) (p.45)`, `Cleaning areas and protocols for chemical equipment (The Preserve Golf Club) (p.46)`

### old_fort_bayou_2019 / implementation

Missed (gold not found): `Third Steering and Technical Advisory Committee meeting at Gulf Hills (September 25, 2018) (p.49)`, `Incentive program for homeowners implementing shoreline BMPs (p.50)`

### old_fort_bayou_2019 / monitoring

Missed (gold not found): `Nonpoint source share of the allocated fecal coliform load (2002 TMDL) (p.6)`, `pH - upstream (The Preserve Golf Club) (p.38)`, `pH - downstream (Twelve Oaks) (p.38)`, `Acres treated by demonstration project BMPs (p.44)`, `Additional bacteria monitoring to delineate pathogen sources (p.47)`, `Erosion and sediment yield assessment to target BMPs (p.47)`, `Observation of boat traffic to assess wake scouring (p.51)`, `Integrated watershed assessment every five years (p.62)`

### old_fort_bayou_2019 / outreach

Missed (gold not found): `Adopt-a-Roadway program (p.52)`, `SWCD and Refuge education programming for school groups and events (p.58)`, `Plastic Free Gulf Coast restaurant engagement (p.60)`

Extra (predicted, not in gold): `Plastic Free Gulf Coast restaurant engagement (p.41)`

### old_fort_bayou_2019 / geographic

Missed (gold not found): `HUC 031700090604 (p.6)`, `Southeastern Plains ecoregion (p.26)`, `Southern Coastal Plain ecoregion (p.26)`, `Land in conservation (middle third of the watershed) (p.31)`

### steele_bayou_2009 / implementation

Missed (gold not found): `Evaluate the plan and submit comments within one month (p.24)`

Extra (predicted, not in gold): `Chemical control of water hyacinth using 2-4D (p.19)`, `Evaluation and submittal of comments (p.24)`

### steele_bayou_2009 / monitoring

Missed (gold not found): `USGS suspended sediment sampling at four bridge crossings and five field edge sites (p.23)`, `MDWFP fishery monitoring (p.20)`

### steele_bayou_2009 / outreach

Missed (gold not found): `Articles in partnering agencies' magazines and newsletters (p.22)`

Extra (predicted, not in gold): `Stakeholder notification and comment period for plan evaluation (p.24)`, `Stakeholder review of draft revised plan (p.24)`

### steele_bayou_2009 / geographic

Missed (gold not found): `Wetlands in the watershed (p.8)`, `Deer Creek watershed (p.8)`, `Mississippi Alluvial Plain eco-region (p.8)`, `Lower Steele Bayou Channel (p.11)`

Extra (predicted, not in gold): `Steele Bayou (channel) (p.8)`

### yazoo_pass_9ke_2021 / goals

Extra (predicted, not in gold): `Meet E. coli pathogen criterion (p.11)`

### yazoo_pass_9ke_2021 / implementation

Extra (predicted, not in gold): `Delta F.A.R.M. implements conservation strategies (p.6)`, `Identify NRCS program opportunities and assist producers (p.7)`, `Phase 1 project management, implementation, coordination and plan revision (p.8)`

### yazoo_pass_9ke_2021 / monitoring

Missed (gold not found): `Dissolved Oxygen % saturation (p.12)`, `Chemical Oxygen Demand (p.12)`

Extra (predicted, not in gold): `Education program evaluation and attendance (p.8)`, `Final report pollutant reductions and acreage affected (p.10)`

### yazoo_pass_9ke_2021 / outreach

Missed (gold not found): `On-Site Disposal System education (p.9)`

Extra (predicted, not in gold): `Inform priority-area landowners and operators about the project (p.10)`, `Project presentations as requested by MDEQ (p.10)`, `Finalize education and outreach plan and schedule events (p.11)`

### yazoo_pass_9ke_2021 / geographic

Extra (predicted, not in gold): `Moon Lake Watershed (TMDL area) (p.4)`


import { z } from "zod";
import { LLM_ITEM_SCHEMAS, type Category } from "@det/shared";
import { schemaForPrompt } from "../json.js";

/**
 * Per-category instructions. Each becomes the user message of one call that shares the cached
 * document prefix; only this message differs between the six calls. Examples are written for
 * both document families (narrative plans and nine-element plans) because the failure mode we
 * guard against is the model treating explanatory prose as commitments.
 */

export function outputSchemaFor(category: Category) {
  return z.object({ items: z.array(LLM_ITEM_SCHEMAS[category]) });
}

const CATEGORY_INSTRUCTIONS: Record<Category, string> = {
  goals: `Extract the plan's GOALS and OBJECTIVES.

Include:
- Stated goals ("The goal of this plan is to reduce sediment loading to Moon Lake...").
- Numeric targets ("reduce sediment yields by 55%-66%", "restore the designated use of fish and wildlife support").
- Objectives listed under goals, as separate items with kind "objective".
- The goal blocks of narrative plans (a "Goal" heading followed by the outcome for a priority concern).

Exclude:
- Program purposes in general ("the Section 319 program aims to...").
- Milestones and tasks (those are implementation activities) and BMPs (those are management measures) unless the sentence itself states an outcome.
- Mission statements that do not name an outcome.

Fields: kind ("goal" or "objective"); pollutants named in the goal (e.g. "sediment", "nutrients", "fecal coliform"); targetValue + targetUnit when the goal gives one number (e.g. 35 and "%"); targetText for ranges or qualitative targets ("35% to 56% reduction", "meet the dissolved oxygen criterion"); timeframe when stated ("by 2025", "within 3 years").`,

  bmps: `Extract the BEST MANAGEMENT PRACTICES (BMPs) / MANAGEMENT MEASURES the plan proposes, funds or has installed for this watershed.

Include:
- Each practice type in a BMP table or list, with its quantity, unit and cost from the same row ("Grade Stabilization Structure (#) | 32 @ $6,480 | $207,360" gives quantity 32, unit "#", estimatedCost 207360).
- Practices named in the text as planned for this watershed ("Delta F.A.R.M. will install water control structures and vegetated ditches").
- Programmatic measures when the plan commits to them (septic system repair program, nutrient management plans).

Exclude:
- General descriptions of what a practice is or does, lists of NRCS practice standards offered as background, and practices mentioned only as examples of what could be used elsewhere.
- Education activities (those are outreach) and monitoring.

Fields: category (agricultural: cropland/pasture practices; structural: engineered water control, grade stabilization, sediment basins; streambank_riparian: buffers, bank stabilization, fencing cattle out of streams; urban_stormwater: LID, detention, ordinances; forestry; wastewater_septic; education; other); quantity + unit when stated; estimatedCost in dollars when stated; targetPollutants; expectedLoadReduction when the document gives a number for this practice; status (planned / in_progress / completed / unknown); location (priority area, sub-watershed or site when named).`,

  implementation: `Extract IMPLEMENTATION ACTIVITIES: tasks, milestones and scheduled steps for carrying out the plan.

Include:
- Work-plan tasks ("The grantee shall secure commitments from landowners... (Months 2-12)").
- Milestone rows ("Finalize revised WBP | Final Revised WBP | Months 28-36") with isMilestone true.
- Implementation/action paragraphs in narrative plans that say who will do what.
- Plan evaluation and revision steps, reporting duties, project management tasks.

Exclude:
- The BMPs themselves (extract the act of installing them only when the plan schedules it as a task).
- Monitoring activities (those go to monitoring) and education events (outreach), unless the sentence is a scheduling/milestone statement about them.

Fields: responsibleParty (organisation or role named); timeframe as written ("Months 1-6", "Year 2", "by December 2020"); isMilestone (true for milestone/outcome tables and dated deliverables); status; relatedBmp when the task is about a specific practice; cost when a dollar figure is attached to the task.`,

  monitoring: `Extract MONITORING METRICS: what the plan measures, its values, and the monitoring arrangements.

Include:
- Water quality criteria and thresholds (each parameter row of a criteria table is one item with valueKind "threshold" and comparator, e.g. Dissolved Oxygen, value 5.0, unit "mg/L", comparator ">=").
- Baseline conditions reported with numbers (valueKind "baseline"), targets (valueKind "target") and results achieved (valueKind "achieved").
- Biological indicators (IBI scores, habitat assessments), implementation tracking metrics (number of BMPs installed, acres treated) and social metrics (participants reached) when the plan says it will track them.
- Sampling arrangements: parameter, location, frequency, responsible party, even without a number (value null, valueKind "unspecified").

Exclude:
- Generic statements that monitoring is important, and descriptions of state-wide monitoring programs not applied to this watershed.
- Work-plan tasks and milestones that are not measurements (collecting GPS coordinates, taking photos, submitting reports, finalizing plans): those are implementation activities.
- The plan's overall goals restated as numbers ("reduce sediment by 35%"): those are goals, unless the document presents the figure as a measured criterion of progress.

Fields: metricType; parameter (the thing measured); value + unit when stated; valueKind; comparator (<, <=, =, >=, >) for thresholds and targets; location; frequency; responsibleParty.`,

  outreach: `Extract OUTREACH ACTIVITIES: education, information and public participation activities the plan commits to or reports.

Include:
- Each named activity in an education/outreach section or list ("Teacher Workshops", "Adopt A Stream", "Water Bill Mailers", "Tippah County Fair booth", "Landowner Meeting and Field Days", radio advertisements, signage, fact sheets, presentations).
- Stakeholder and watershed-team meetings when the plan schedules them.

Exclude:
- Statements that outreach matters in general, and descriptions of programs offered state-wide unless the plan says they will be used in this watershed.

Fields: activityType; audience (landowners, students, teachers, general public...); count when a number of events/materials/people is stated; timeframe; responsibleParty.`,

  geographic: `Extract GEOGRAPHIC AREAS the plan covers or refers to.

Include:
- The plan's watershed (isPrimary true) with its HUC code and area ("Yazoo Pass Watershed (080302040903) is a 25,662-acre watershed").
- Sub-watersheds, HUC codes, named streams, rivers, bayous, lakes and reservoirs in the watershed.
- Counties and municipalities the watershed lies in, and named priority areas or project areas.

Exclude:
- Places mentioned only as the location of an organisation's office or as a comparison from another region.

Fields: areaType; hucCode when stated (digits only, as written); areaValue + areaUnit when the document gives an area or length (acres, square miles, miles); isPrimary.`,
};

/** The user message for one category call: instructions, section hints, and the exact JSON shape. */
export function buildUserMessage(category: Category, relevantSections: string[]): string {
  const hints =
    relevantSections.length > 0
      ? `\n\nSections most likely to contain this category (check the whole document, these are only hints):\n${relevantSections
          .slice(0, 20)
          .map((s) => `- ${s}`)
          .join("\n")}`
      : "";
  return `${CATEGORY_INSTRUCTIONS[category]}${hints}

Output: reply with ONE JSON object and nothing else (no prose, no code fences) of the form {"items": [...]}, where every item matches this JSON Schema exactly (all fields present; null where the document does not state a value; empty list when nothing qualifies):
${schemaForPrompt(LLM_ITEM_SCHEMAS[category])}`;
}
